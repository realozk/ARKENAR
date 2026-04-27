use crate::http::{BodyType, HttpRequest};
use reqwest::header::{HeaderName, HeaderValue, CONTENT_LENGTH};
use serde_json::Value;
use std::collections::HashSet;
use url::form_urlencoded;

pub const CANARY_TOKEN: &str = "ARK-1337";

pub fn build_canary_request(base_req: &HttpRequest) -> HttpRequest {
    let mut canary_req = base_req.clone();
    canary_req
        .url
        .query_pairs_mut()
        .append_pair("canary", CANARY_TOKEN);
    update_content_length(&mut canary_req);
    canary_req
}

const MAX_JSON_DEPTH: usize = 32;

#[derive(Debug, Clone, PartialEq)]
pub enum InjectionPoint {
    UrlParam(String),
    Header(String),
    JsonField(String),
    FormParam(String),
}

#[derive(Debug, Clone, PartialEq)]
enum JsonPathNode {
    ObjectKey(String),
    ArrayIndex(usize),
}

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

fn extract_json_paths_recursive(
    value: &Value,
    current_path: &str,
    points: &mut Vec<InjectionPoint>,
    depth: usize,
) {
    if depth > MAX_JSON_DEPTH {
        return;
    }
    match value {
        Value::Object(map) => {
            for (key, val) in map {
                let new_path = if current_path.is_empty() {
                    key.clone()
                } else {
                    format!("{}.{}", current_path, key)
                };
                extract_json_paths_recursive(val, &new_path, points, depth + 1);
            }
        }
        Value::Array(arr) => {
            for (index, val) in arr.iter().enumerate() {
                let new_path = if current_path.is_empty() {
                    format!("[{}]", index)
                } else {
                    format!("{}[{}]", current_path, index)
                };
                extract_json_paths_recursive(val, &new_path, points, depth + 1);
            }
        }
        Value::String(_) | Value::Number(_) | Value::Bool(_) | Value::Null => {
            if !current_path.is_empty() {
                points.push(InjectionPoint::JsonField(current_path.to_string()));
            }
        }
    }
}

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
                extract_json_paths_recursive(&json_value, "", &mut points, 0);
            }
        }
        BodyType::FormUrlEncoded => {
            let parsed = form_urlencoded::parse(req.body.as_bytes());
            for (key, _) in parsed {
                if !key.is_empty() {
                    points.push(InjectionPoint::FormParam(key.into_owned()));
                }
            }
        }
        _ => {}
    }

    points
}

/// Tokenizes a raw JSON path string (e.g., "user.data[0].id") into safe enum nodes
fn tokenize_json_path(path: &str) -> Vec<JsonPathNode> {
    let mut nodes = Vec::new();
    for part in path.split('.') {
        if part.is_empty() {
            continue;
        }

        if let Some(bracket_idx) = part.find('[') {
            let key = &part[..bracket_idx];
            if !key.is_empty() {
                nodes.push(JsonPathNode::ObjectKey(key.to_string()));
            }

            let mut remaining = &part[bracket_idx..];
            while let Some(start) = remaining.find('[') {
                if let Some(end) = remaining.find(']') {
                    if let Ok(idx) = remaining[start + 1..end].parse::<usize>() {
                        nodes.push(JsonPathNode::ArrayIndex(idx));
                    }
                    remaining = &remaining[end + 1..];
                } else {
                    break;
                }
            }
        } else {
            nodes.push(JsonPathNode::ObjectKey(part.to_string()));
        }
    }
    nodes
}

fn inject_into_json(value: &mut Value, path: &str, payload: &str) -> bool {
    let nodes = tokenize_json_path(path);
    if nodes.is_empty() {
        return false;
    }
    inject_into_json_recursive(value, &nodes, 0, payload)
}

fn inject_into_json_recursive(
    value: &mut Value,
    nodes: &[JsonPathNode],
    index: usize,
    payload: &str,
) -> bool {
    if index >= nodes.len() || index > MAX_JSON_DEPTH {
        return false;
    }

    let is_last = index == nodes.len() - 1;
    let node = &nodes[index];

    match node {
        JsonPathNode::ObjectKey(key) => {
            if is_last {
                if let Some(target) = value.get_mut(key) {
                    inject_payload_into_value(target, payload);
                    return true;
                }
                false
            } else if let Some(next_value) = value.get_mut(key) {
                inject_into_json_recursive(next_value, nodes, index + 1, payload)
            } else {
                false
            }
        }
        JsonPathNode::ArrayIndex(arr_idx) => {
            if is_last {
                if let Some(target) = value.get_mut(*arr_idx) {
                    inject_payload_into_value(target, payload);
                    return true;
                }
                false
            } else if let Some(next_value) = value.get_mut(*arr_idx) {
                inject_into_json_recursive(next_value, nodes, index + 1, payload)
            } else {
                false
            }
        }
    }
}

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
        _ => {
            *value = Value::String(payload.to_string());
        }
    }
}

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

fn mutate_header(req: &mut HttpRequest, header_name: &str, payload: &str) {
    if let Ok(name) = HeaderName::try_from(header_name) {
        if let Ok(value) = HeaderValue::from_str(payload) {
            req.headers.insert(name, value);
        }
    }
}

fn mutate_json_field(req: &mut HttpRequest, json_path: &str, payload: &str) {
    if let Ok(mut json_value) = serde_json::from_str::<Value>(&req.body) {
        if inject_into_json(&mut json_value, json_path, payload) {
            if let Ok(new_body) = serde_json::to_string(&json_value) {
                req.body = new_body;
            }
        }
    }
}

fn mutate_form_param(req: &mut HttpRequest, form_key: &str, payload: &str) {
    let parsed: Vec<(String, String)> = form_urlencoded::parse(req.body.as_bytes())
        .into_owned()
        .collect();

    let mut serializer = form_urlencoded::Serializer::new(String::new());

    for (key, val) in parsed {
        if key == form_key {
            serializer.append_pair(&key, payload);
        } else {
            serializer.append_pair(&key, &val);
        }
    }

    req.body = serializer.finish();
}

fn update_content_length(req: &mut HttpRequest) {
    let body_len = req.body.len();
    if body_len == 0 {
        req.headers.remove(CONTENT_LENGTH);
        return;
    }
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
        headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("application/x-www-form-urlencoded"),
        );

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

        assert!(
            mutated.url.query().unwrap().contains("' OR 1=1--")
                || mutated.url.to_string().contains("%27")
        );
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

        let new_len: usize = mutated
            .headers
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
