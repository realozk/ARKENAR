use rand::prelude::IndexedRandom;
use reqwest::{Client, ClientBuilder, Response, Proxy};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::time::Duration;

use super::{BodyType, HttpRequest};

pub struct HttpClient {
    inner: Client,
    user_agents: Vec<&'static str>,
    default_timeout: Duration,
    default_headers: HeaderMap,
}

impl HttpClient {
    pub fn new(timeout_seconds: u64, proxy_url: Option<&str>, custom_headers: &[(String, String)]) -> Self {
        let timeout = Duration::from_secs(timeout_seconds);

        let mut builder = ClientBuilder::new()
            .timeout(timeout)
            .danger_accept_invalid_certs(true);

        if let Some(proxy) = proxy_url {
            if let Ok(p) = Proxy::all(proxy) {
                builder = builder.proxy(p);
            }
        }

        let inner = builder.build().expect("failed to build reqwest client");

        let mut default_headers = HeaderMap::new();
        for (key, val) in custom_headers {
            if let (Ok(name), Ok(value)) = (
                HeaderName::from_bytes(key.as_bytes()),
                HeaderValue::from_str(val),
            ) {
                default_headers.insert(name, value);
            }
        }
        // Randomized User-Agent pool for fingerprint evasion
        let user_agents = vec![
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) \
             Gecko/20100101 Firefox/120.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 \
             (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        ];

        Self {
            inner,
            user_agents,
            default_timeout: timeout,
            default_headers,
        }
    }

    pub async fn send_request(&self, req: &HttpRequest) -> Result<Response, reqwest::Error> {
        let mut builder = self.inner
            .request(req.method.clone(), req.url.as_str());

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

    pub async fn get(&self, url: &str) -> Result<Response, reqwest::Error> {
        let ua = self.get_random_user_agent();

        let mut req = self.inner
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

        let mut req = self.inner
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
        *self.user_agents.choose(&mut rng).unwrap_or(&"Mozilla/5.0")
    }
}
