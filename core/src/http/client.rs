use rand::prelude::IndexedRandom;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use reqwest::redirect::Policy;
use reqwest::{Client, ClientBuilder, Proxy, Response};
use std::time::Duration;
use url::Url;

pub const MAX_RESPONSE_BODY: usize = 4 * 1024 * 1024;

use super::{BodyType, HttpRequest};

/// A response with its body already read (capped) and scanned for secrets.
///
/// Reading the body is one-way (`Response::bytes` consumes it), so this is where
/// the global secret filter runs — every body fetched via [`HttpClient::send`]
/// passes through it.
pub struct CapturedResponse {
    pub status: u16,
    pub headers: HeaderMap,
    pub final_url: Url,
    pub body: String,
    pub secrets: Vec<arkenar_secrets::Secret>,
}

pub struct HttpClient {
    inner: Client,
    user_agents: Vec<&'static str>,
    default_timeout: Duration,
    default_headers: HeaderMap,
}

impl HttpClient {
    /// Create a new HTTP client.
    ///
    /// # Parameters
    /// - `timeout_seconds` — per-request timeout
    /// - `proxy_url` — optional HTTP/SOCKS proxy URL
    /// - `custom_headers` — key-value pairs to attach to every request
    /// - `allow_insecure_tls` — if `true`, accept invalid TLS certificates
    ///   (self-signed, expired, hostname mismatch). **SECURITY NOTE: enabling
    ///   this makes scanner traffic MITM-able.** Defaults to `false` on every
    ///   normal call site; only set `true` when the user explicitly opts in.
    pub fn new(
        timeout_seconds: u64,
        proxy_url: Option<&str>,
        custom_headers: &[(String, String)],
        allow_insecure_tls: bool,
    ) -> Result<Self, reqwest::Error> {
        if allow_insecure_tls {
            log::warn!(
                "HTTP client configured with INSECURE TLS (accepting invalid certificates). \
                 Traffic is MITM-vulnerable."
            );
        }

        let timeout = Duration::from_secs(timeout_seconds);

        let mut builder = ClientBuilder::new()
            .timeout(timeout)
            .redirect(Policy::limited(5))
            .danger_accept_invalid_certs(allow_insecure_tls);

        if let Some(proxy) = proxy_url {
            if let Ok(p) = Proxy::all(proxy) {
                builder = builder.proxy(p);
            }
        }

        let inner = builder.build()?;

        let mut default_headers = HeaderMap::new();
        for (key, val) in custom_headers {
            if let (Ok(name), Ok(value)) = (
                HeaderName::from_bytes(key.as_bytes()),
                HeaderValue::from_str(val),
            ) {
                default_headers.insert(name, value);
            }
        }
        let user_agents = vec![
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) \
             Gecko/20100101 Firefox/120.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 \
             (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        ];

        Ok(Self {
            inner,
            user_agents,
            default_timeout: timeout,
            default_headers,
        })
    }

    pub async fn send_request(&self, req: &HttpRequest) -> Result<Response, reqwest::Error> {
        let mut builder = self.inner.request(req.method.clone(), req.url.as_str());

        for (name, value) in self.default_headers.iter() {
            builder = builder.header(name, value);
        }

        for (name, value) in req.headers.iter() {
            builder = builder.header(name, value);
        }

        if !req.headers.contains_key(reqwest::header::USER_AGENT) {
            let ua = self.get_random_user_agent();
            builder = builder.header(reqwest::header::USER_AGENT, ua);
        }

        if !req.body.is_empty() {
            if !req.headers.contains_key(reqwest::header::CONTENT_TYPE) {
                let content_type = match req.body_type {
                    BodyType::Json => "application/json",
                    BodyType::FormUrlEncoded => "application/x-www-form-urlencoded",
                    BodyType::Multipart => "multipart/form-data",
                    BodyType::Raw | BodyType::None => "text/plain",
                };
                builder = builder.header(reqwest::header::CONTENT_TYPE, content_type);
            }
            builder = builder.body(req.body.clone());
        }

        builder = builder.timeout(self.default_timeout);
        builder.send().await
    }

    /// Sends a request, reads the body once (capped at [`MAX_RESPONSE_BODY`]), and
    /// runs the secret filter on it. The global choke point for response scanning.
    pub async fn send(&self, req: &HttpRequest) -> Result<CapturedResponse, reqwest::Error> {
        let resp = self.send_request(req).await?;
        let status = resp.status().as_u16();
        let headers = resp.headers().clone();
        let final_url = resp.url().clone();
        let content_type = headers
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let bytes = resp.bytes().await?;
        let len = bytes.len().min(MAX_RESPONSE_BODY);
        let capped = &bytes[..len];
        let secrets = arkenar_secrets::scan_bytes(capped, content_type.as_deref());
        let body = String::from_utf8_lossy(capped).into_owned();

        Ok(CapturedResponse {
            status,
            headers,
            final_url,
            body,
            secrets,
        })
    }

    pub async fn get(&self, url: &str) -> Result<Response, reqwest::Error> {
        let ua = self.get_random_user_agent();

        let mut req = self
            .inner
            .get(url)
            .header(reqwest::header::USER_AGENT, ua)
            .timeout(Duration::from_secs(5));

        for (name, value) in self.default_headers.iter() {
            req = req.header(name, value);
        }

        req.send().await
    }

    pub async fn get_with_user_agent(
        &self,
        url: &str,
        user_agent: &str,
    ) -> Result<Response, reqwest::Error> {
        self.inner
            .get(url)
            .header(reqwest::header::USER_AGENT, user_agent)
            .timeout(Duration::from_secs(5))
            .send()
            .await
    }

    pub async fn get_with_custom_headers(
        &self,
        url: &str,
        user_agent: Option<&str>,
        referer: Option<&str>,
        x_forwarded_for: Option<&str>,
    ) -> Result<Response, reqwest::Error> {
        let ua = user_agent.unwrap_or_else(|| self.get_random_user_agent());

        let mut req = self
            .inner
            .get(url)
            .header(reqwest::header::USER_AGENT, ua)
            .timeout(Duration::from_secs(10));

        if let Some(ref_val) = referer {
            req = req.header(reqwest::header::REFERER, ref_val);
        }

        if let Some(xff) = x_forwarded_for {
            req = req.header("X-Forwarded-For", xff);
        }

        req.send().await
    }

    fn get_random_user_agent(&self) -> &'static str {
        let mut rng = rand::rng();
        self.user_agents
            .choose(&mut rng)
            .copied()
            .expect("user_agents pool is constructor-initialized and non-empty")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::HttpRequest;
    use reqwest::Method;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn send_runs_secret_filter_on_body() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((mut sock, _)) = listener.accept().await {
                let mut buf = [0u8; 1024];
                let _ = sock.read(&mut buf).await;
                let body = "<html>const k='sk-proj-AbCd012345EfGh_QwErTyUiOp6789';</html>";
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = sock.write_all(resp.as_bytes()).await;
                let _ = sock.flush().await;
            }
        });

        let client = HttpClient::new(5, None, &[], false).unwrap();
        let url = Url::parse(&format!("http://{}/", addr)).unwrap();
        let req = HttpRequest::new(Method::GET, url, HeaderMap::new(), String::new());
        let cap = client.send(&req).await.unwrap();

        assert!(cap.body.contains("sk-proj-"));
        assert!(cap.secrets.iter().any(|s| s.kind == "OpenAI API Key"));
    }
}
