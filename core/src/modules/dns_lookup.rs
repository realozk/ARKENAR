use anyhow::Result;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};
use trust_dns_resolver::config::{ResolverConfig, ResolverOpts};
use trust_dns_resolver::TokioAsyncResolver;

pub struct DnsResult {
    pub a_records: Vec<String>,
    pub mx: Vec<String>,
    pub txt: Vec<String>,
    pub cname: Option<String>,
    pub whois_raw: String,
}

pub async fn resolve_domain(domain: &str) -> Result<DnsResult> {
    let resolver = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());

    let a_records = match resolver.lookup_ip(domain).await {
        Ok(resp) => resp.iter().map(|ip| ip.to_string()).collect(),
        Err(_) => vec![],
    };

    let mx = match resolver.mx_lookup(domain).await {
        Ok(resp) => resp.iter().map(|r| r.exchange().to_string()).collect(),
        Err(_) => vec![],
    };

    let txt = match resolver.txt_lookup(domain).await {
        Ok(resp) => resp
            .iter()
            .map(|r| {
                r.iter()
                    .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .collect(),
        Err(_) => vec![],
    };

    let cname = match resolver.lookup_ip(domain).await {
        Ok(resp) => resp.as_lookup().records().iter().find_map(|r| {
            r.data().and_then(|d| {
                if let trust_dns_resolver::proto::rr::RData::CNAME(ref c) = d {
                    Some(c.to_string())
                } else {
                    None
                }
            })
        }),
        Err(_) => None,
    };

    let whois_raw = fetch_whois(domain).await;

    Ok(DnsResult {
        a_records,
        mx,
        txt,
        cname,
        whois_raw,
    })
}

async fn fetch_whois(domain: &str) -> String {
    let fut = async {
        let mut stream = TcpStream::connect("whois.iana.org:43").await?;
        let query = format!("{}\r\n", domain);
        stream.write_all(query.as_bytes()).await?;

        let mut buf = vec![0u8; 8192];
        let n = stream.read(&mut buf).await?;
        buf.truncate(n);
        Ok::<String, anyhow::Error>(String::from_utf8_lossy(&buf).into_owned())
    };

    match timeout(Duration::from_secs(3), fut).await {
        Ok(Ok(s)) => s,
        _ => String::new(),
    }
}
