//! Discovery & enumeration modules. Katana and Nuclei wrappers removed in 1.3.
//! `subfinder` is the last external-tool wrapper — being replaced by a native passive
//! enumerator in 1.3 (see docs/V1.3.md, Section 2).
pub mod crawler_native;
pub mod dns_lookup;
pub mod js_secrets;
pub mod key_verifier;
pub mod port_scanner;
pub mod subfinder;
