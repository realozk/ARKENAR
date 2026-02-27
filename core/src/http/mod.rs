pub mod client;

pub use client::HttpClient;

use reqwest::header::{HeaderMap, CONTENT_TYPE};
use reqwest::Method;
use url::Url;

/// Represents the type of body content in an HTTP request.
#[derive(Debug, Clone, PartialEq)]
pub enum BodyType {
    Json,
    FormUrlEncoded,
    Multipart,
    Raw,
    None,
}

impl BodyType {
    /// Detects the body type from the Content-Type header.
    pub fn detect_body_type(headers: &HeaderMap) -> BodyType {
        if let Some(content_type) = headers.get(CONTENT_TYPE) {
            if let Ok(value) = content_type.to_str() {
                let value_lower = value.to_lowercase();
                if value_lower.contains("application/json") {
                    return BodyType::Json;
                } else if value_lower.contains("application/x-www-form-urlencoded") {
                    return BodyType::FormUrlEncoded;
                } else if value_lower.contains("multipart/form-data") {
                    return BodyType::Multipart;
                } else {
                    return BodyType::Raw;
                }
            }
        }
        BodyType::None
    }
}

/// Represents an HTTP request with all its components.
#[derive(Debug, Clone)]
pub struct HttpRequest {
    pub method: Method,
    pub url: Url,
    pub headers: HeaderMap,
    pub body: String,
    pub body_type: BodyType,
}

impl HttpRequest {
    /// Creates a new `HttpRequest`, auto-detecting the body type from headers.
    pub fn new(method: Method, url: Url, headers: HeaderMap, body: String) -> Self {
        let body_type = BodyType::detect_body_type(&headers);
        Self {
           method,
            url,
            headers,
            body,
            body_type,
        }
    }
}
