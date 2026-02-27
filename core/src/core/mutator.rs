use crate::http::{BodyType, HttpRequest};
use reqwest::header::{HeaderName, HeaderValue, CONTENT_LENGTH};
use serde_json::Value;
use std::collections::HashSet;


/// Represents different points in an HTTP request where payloads can be injected
#[derive(Debug, Clone, PartialEq)]
pub enum InjectionPoint {
    /// Injection into a URL query parameter. Contains the parameter name
    UrlParam(String),
    /// Injection into an HTTP header. Contains the header name
    Header(String),
    /// Injection into a JSON field. Contains the JSON path (e.g., "user.profile.name")
    JsonField(String),
    /// Injection into a form-urlencoded parameter. Contains the parameter name
    FormParam(String),
}

/// Headers that should be excluded from injection point extraction
/// These are standard headers that shouldn't be fuzzed
fn get_blacklisted_headers() -> HashSet<&'static str> {
    let mut blacklist = HashSet::new();
    blacklist.insert("host");
    blacklist.insert("content-length");
    blacklist.insert("content-type");
    blacklist.insert("connection");
    blacklist.insert("accept-encoding");
    blacklist.insert("transfer-encoding");
    blacklist.insert("te");
    blacklist.insert("trailer");
    blacklist.insert("upgrade");
    blacklist.insert("via");
    blacklist.insert("proxy-authorization");
    blacklist.insert("proxy-connection");
    blacklist
}

/// Recursively traverses a JSON value and extracts all injectable field paths
/// 
/// # Arguments
/// * `value` - The JSON value to traverse
/// * `current_path` - The current path in the JSON tree (e.g., "user.profile")
/// * `points` - Mutable vector to collect discovered injection points
fn extract_json_paths_recursive(value: &Value, current_path: &str, points: &mut Vec<InjectionPoint>) {
    match value {
        Value::Object(map) => {
            for (key, val) in map {
                let new_path = if current_path.is_empty() {
                    key.clone()
                } else {
                    format!("{}.{}", current_path, key)
                };
                extract_json_paths_recursive(val, &new_path, points);
            }
        }
        Value::Array(arr) => {
            for (index, val) in arr.iter().enumerate() {
                let new_path = if current_path.is_empty() {
                    format!("[{}]", index)
                } else {
                    format!("{}[{}]", current_path, index)
                };
                extract_json_paths_recursive(val, &new_path, points);
            }
        }
        // Terminal values (string, number, bool, null) are injectable
        Value::String(_) | Value::Number(_) | Value::Bool(_) | Value::Null => {
            if !current_path.is_empty() {
                points.push(InjectionPoint::JsonField(current_path.to_string()));
            }
        }
    }
}

/// Extracts all potential injection points from an HTTP request
/// 
/// This function analyzes the request and identifies all locations where
/// payloads could be injected for security testing, including:
/// - URL query parameters
/// - HTTP headers (excluding blacklisted ones)
/// - JSON body fields (for JSON content type)
/// - Form parameters (for form-urlencoded content type)
/// 
/// # Arguments
/// `req` - Reference to the HTTP request to analyze
/// 
/// # Returns
/// A vector of all discovered injection points
pub fn extract_injection_points(req: &HttpRequest) -> Vec<InjectionPoint> {
    let mut points = Vec::new();
    
    for (key, _value) in req.url.query_pairs() {
        points.push(InjectionPoint::UrlParam(key.to_string()));
    }
    
    let blacklist = get_blacklisted_headers();
    for (name, _value) in req.headers.iter() {
        let header_name = name.as_str().to_lowercase();
        if !blacklist.contains(header_name.as_str()) {
            points.push(InjectionPoint::Header(name.to_string()));
        }
    }
    
    match req.body_type {
        BodyType::Json => {
            if let Ok(json_value) = serde_json::from_str::<Value>(&req.body) {
                extract_json_paths_recursive(&json_value, "", &mut points);
            }
        }
        BodyType::FormUrlEncoded => {
            for pair in req.body.split('&') {
                if let Some((key, _value)) = pair.split_once('=') {
                    if !key.is_empty() {
                        points.push(InjectionPoint::FormParam(key.to_string()));
                    }
                }
            }
        }
        _ => {}
    }
    
    points
}

/// Modifies a JSON value at the specified path with a payload
/// 
/// # Arguments
/// * `value` - Mutable reference to the JSON value
/// * `path_parts` - Iterator over the path components
/// * `payload` - The payload string to inject
/// 
/// # Returns
/// `true` if the modification was successful, `false` otherwise
fn inject_into_json(value: &mut Value, path: &str, payload: &str) -> bool {
    let parts: Vec<&str> = path.split('.').collect();
    inject_into_json_recursive(value, &parts, 0, payload)
}

fn inject_into_json_recursive(value: &mut Value, parts: &[&str], index: usize, payload: &str) -> bool {
    if index >= parts.len() {
        return false;
    }
    
    let current_part = parts[index];
    
    if let Some(bracket_pos) = current_part.find('[') {
        // Handle cases like "items[0]" or just "[0]"
        let field_name = &current_part[..bracket_pos];
        let rest = &current_part[bracket_pos..];
        
        let mut current_value = if field_name.is_empty() {
            value
        } else {
            match value.get_mut(field_name) {
                Some(v) => v,
                None => return false,
            }
        };
        
        let mut remaining = rest;
        while let Some(start) = remaining.find('[') {
            if let Some(end) = remaining.find(']') {
                if let Ok(arr_index) = remaining[start + 1..end].parse::<usize>() {
                    current_value = match current_value.get_mut(arr_index) {
                        Some(v) => v,
                        None => return false,
                    };
                    remaining = &remaining[end + 1..];
                } else {
                    return false;
                }
            } else {
                return false;
            }
        }
        
        if index == parts.len() - 1 {
            inject_payload_into_value(current_value, payload);
            return true;
        } else {
            return inject_into_json_recursive(current_value, parts, index + 1, payload);
        }
    }
    
    if index == parts.len() - 1 {
        // Last part - inject payload here
        if let Some(target) = value.get_mut(current_part) {
            inject_payload_into_value(target, payload);
            return true;
        }
        false
    } else {
        if let Some(next_value) = value.get_mut(current_part) {
            inject_into_json_recursive(next_value, parts, index + 1, payload)
        } else {
            false
        }
    }
}

/// Injects a payload into a JSON value, preserving type where sensible
fn inject_payload_into_value(value: &mut Value, payload: &str) {
    match value {
        Value::String(_) => {
            *value = Value::String(payload.to_string());
        }
        Value::Number(_) => {
            if let Ok(num) = payload.parse::<i64>() {
                *value = Value::Number(num.into());
            } else if let Ok(num) = payload.parse::<f64>() {
                if let Some(n) = serde_json::Number::from_f64(num) {
                    *value = Value::Number(n);
                } else {
                    *value = Value::String(payload.to_string());
                }
            } else {
                *value = Value::String(payload.to_string());
            }
        }
        Value::Bool(_) => {
            if payload.eq_ignore_ascii_case("true") {
                *value = Value::Bool(true);
            } else if payload.eq_ignore_ascii_case("false") {
                *value = Value::Bool(false);
            } else {
                *value = Value::String(payload.to_string());
            }
        }
        Value::Null => {
            *value = Value::String(payload.to_string());
        }
        _ => {
            *value = Value::String(payload.to_string());
        }
    }
}

/// Creates a mutated copy of an HTTP request with a payload injected at the specified point
/// 
/// This function clones the original request and modifies only the specified
/// injection point with the given payload. It also updates the Content-Length
/// header if the body size changes
/// 
/// # Arguments
/// * `req` - Reference to the original HTTP request
/// * `point` - The injection point where the payload should be inserted
/// * `payload` - The payload string to inject
/// 
/// # Returns
/// A new `HttpRequest` with the payload injected at the specified point
pub fn mutate_request(req: &HttpRequest, point: &InjectionPoint, payload: &str) -> HttpRequest {
    let mut new_request = req.clone();
    
    match point {
        InjectionPoint::UrlParam(param_name) => {
            mutate_url_param(&mut new_request, param_name, payload);
        }
        InjectionPoint::Header(header_name) => {
            mutate_header(&mut new_request, header_name, payload);
        }
        InjectionPoint::JsonField(json_path) => {
            mutate_json_field(&mut new_request, json_path, payload);
        }
        InjectionPoint::FormParam(form_key) => {
            mutate_form_param(&mut new_request, form_key, payload);
        }
    }
    
    update_content_length(&mut new_request);
    
    new_request
}

/// Mutates a URL query parameter with the given payload.
fn mutate_url_param(req: &mut HttpRequest, param_name: &str, payload: &str) {
    let mut url = req.url.clone();
    
    let pairs: Vec<(String, String)> = url
        .query_pairs()
        .map(|(k, v)| {
            if k == param_name {
                (k.to_string(), payload.to_string())
            } else {
                (k.to_string(), v.to_string())
            }
        })
        .collect();
    
    url.query_pairs_mut().clear();
    for (k, v) in pairs {
        url.query_pairs_mut().append_pair(&k, &v);
    }
    
    req.url = url;
}

/// Mutates an HTTP header with the given payload
fn mutate_header(req: &mut HttpRequest, header_name: &str, payload: &str) {
    if let Ok(name) = HeaderName::try_from(header_name) {
        if let Ok(value) = HeaderValue::from_str(payload) {
            req.headers.insert(name, value);
        }
    }
}

/// Mutates a JSON body field at the specified path with the given payload
fn mutate_json_field(req: &mut HttpRequest, json_path: &str, payload: &str) {
    if let Ok(mut json_value) = serde_json::from_str::<Value>(&req.body) {
        if inject_into_json(&mut json_value, json_path, payload) {
            if let Ok(new_body) = serde_json::to_string(&json_value) {
                req.body = new_body;
            }
        }
    }
}

/// Mutates a form-urlencoded parameter with the given payload
fn mutate_form_param(req: &mut HttpRequest, form_key: &str, payload: &str) {
    let mut new_pairs: Vec<String> = Vec::new();
    
    for pair in req.body.split('&') {
        if let Some((key, _value)) = pair.split_once('=') {
            if key == form_key {
                let encoded_payload = url_encode(payload);
                new_pairs.push(format!("{}={}", key, encoded_payload));
            } else {
                new_pairs.push(pair.to_string());
            }
        } else {
            new_pairs.push(pair.to_string());
        }
    }
    
    req.body = new_pairs.join("&");
}

/// Simple URL encoding for form parameters
fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            b' ' => {
                encoded.push('+');
            }
            _ => {
                encoded.push('%');
                encoded.push_str(&format!("{:02X}", byte));
            }
        }
    }
    encoded
}

/// Updates the Content-Length header based on the current body size
fn update_content_length(req: &mut HttpRequest) {
    let body_len = req.body.len();
    if let Ok(value) = HeaderValue::from_str(&body_len.to_string()) {
        req.headers.insert(CONTENT_LENGTH, value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, USER_AGENT};
    use reqwest::Method;
    use url::Url;
    
    fn create_test_request_json() -> HttpRequest {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(USER_AGENT, HeaderValue::from_static("TestAgent/1.0"));
        
        let url = Url::parse("https://example.com/api?id=123&name=test").unwrap();
        let body = r#"{"user":{"name":"john","age":25},"active":true}"#.to_string();
        
        HttpRequest::new(Method::POST, url, headers, body)
    }
    
    fn create_test_request_form() -> HttpRequest {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/x-www-form-urlencoded"));
        
        let url = Url::parse("https://example.com/login").unwrap();
        let body = "username=admin&password=secret&remember=true".to_string();
        
        HttpRequest::new(Method::POST, url, headers, body)
    }




    #[test]
    fn test_extract_url_params() {
        let req = create_test_request_json();
        let points = extract_injection_points(&req);
        
        assert!(points.contains(&InjectionPoint::UrlParam("id".to_string())));
        assert!(points.contains(&InjectionPoint::UrlParam("name".to_string())));
    }
    
    #[test]
    fn test_extract_headers() {
        let req = create_test_request_json();
        let points = extract_injection_points(&req);
        
        // user-agent should be extracted (not blacklisted)
        assert!(points.contains(&InjectionPoint::Header("user-agent".to_string())));
        // content-type should NOT be extracted (blacklisted)
        assert!(!points.contains(&InjectionPoint::Header("content-type".to_string())));
    }
    
    #[test]
    fn test_extract_json_fields() {
        let req = create_test_request_json();
        let points = extract_injection_points(&req);
        
        assert!(points.contains(&InjectionPoint::JsonField("user.name".to_string())));
        assert!(points.contains(&InjectionPoint::JsonField("user.age".to_string())));
        assert!(points.contains(&InjectionPoint::JsonField("active".to_string())));
    }
    
    #[test]
    fn test_extract_form_params() {
        let req = create_test_request_form();
        let points = extract_injection_points(&req);
        
        assert!(points.contains(&InjectionPoint::FormParam("username".to_string())));
        assert!(points.contains(&InjectionPoint::FormParam("password".to_string())));
        assert!(points.contains(&InjectionPoint::FormParam("remember".to_string())));
    }
    
    #[test]
    fn test_mutate_url_param() {
        let req = create_test_request_json();
        let point = InjectionPoint::UrlParam("id".to_string());
        let mutated = mutate_request(&req, &point, "' OR 1=1--");
        
        assert!(mutated.url.query().unwrap().contains("' OR 1=1--") || 
                mutated.url.to_string().contains("%27"));
    }
    
    #[test]
    fn test_mutate_json_field() {
        let req = create_test_request_json();
        let point = InjectionPoint::JsonField("user.name".to_string());
        let mutated = mutate_request(&req, &point, "' OR 1=1--");
        
        let json: Value = serde_json::from_str(&mutated.body).unwrap();
        assert_eq!(json["user"]["name"], "' OR 1=1--");
    }
    
    #[test]
    fn test_mutate_form_param() {
        let req = create_test_request_form();
        let point = InjectionPoint::FormParam("username".to_string());
        let mutated = mutate_request(&req, &point, "admin'--");
        
        assert!(mutated.body.contains("username=admin"));
    }
    
    #[test]
    fn test_content_length_updated() {
        let req = create_test_request_json();
        let original_len = req.body.len();
        
        let point = InjectionPoint::JsonField("user.name".to_string());
        let mutated = mutate_request(&req, &point, "very_long_payload_that_changes_body_size");
        
        let new_len: usize = mutated.headers
            .get(CONTENT_LENGTH)
            .unwrap()
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        
        assert_ne!(original_len, new_len);
        assert_eq!(mutated.body.len(), new_len);
    }
    
    #[test]
    fn test_json_array_injection() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        
        let url = Url::parse("https://example.com/api").unwrap();
        let body = r#"{"items":["first","second","third"]}"#.to_string();
        
        let req = HttpRequest::new(Method::POST, url, headers, body);
        let points = extract_injection_points(&req);
        
        assert!(points.contains(&InjectionPoint::JsonField("items[0]".to_string())));
        assert!(points.contains(&InjectionPoint::JsonField("items[1]".to_string())));
        assert!(points.contains(&InjectionPoint::JsonField("items[2]".to_string())));
    }
    
    #[test]
    fn test_nested_json_array_injection() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        
        let url = Url::parse("https://example.com/api").unwrap();
        let body = r#"{"users":[{"name":"alice"},{"name":"bob"}]}"#.to_string();
        
        let req = HttpRequest::new(Method::POST, url, headers, body);
        let points = extract_injection_points(&req);
        
        assert!(points.contains(&InjectionPoint::JsonField("users[0].name".to_string())));
        assert!(points.contains(&InjectionPoint::JsonField("users[1].name".to_string())));
    }
}
