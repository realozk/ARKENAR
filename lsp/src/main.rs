//! Language server: flags hardcoded secrets (OpenAI/Anthropic/AWS/…) with a
//! diagnostic as you type, using `arkenar_secrets::scan_bytes`. No network, no
//! engine — just the shared detection layer.

use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};

struct Backend {
    client: Client,
}

/// Pure text → diagnostics (unit-testable without an editor).
fn diagnostics_for(text: &str) -> Vec<Diagnostic> {
    arkenar_secrets::scan_bytes(text.as_bytes(), None)
        .into_iter()
        .map(|s| {
            let line = s.line.saturating_sub(1) as u32;
            let start = s.col as u32;
            let end = start + s.matched.chars().count() as u32;
            Diagnostic {
                range: Range::new(Position::new(line, start), Position::new(line, end)),
                severity: Some(DiagnosticSeverity::WARNING),
                source: Some("arkenar".to_string()),
                message: format!("Possible {} hardcoded here — move it to an env var / secret store", s.kind),
                ..Default::default()
            }
        })
        .collect()
}

impl Backend {
    async fn publish(&self, uri: Url, text: &str) {
        self.client
            .publish_diagnostics(uri, diagnostics_for(text), None)
            .await;
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {}

    async fn did_open(&self, p: DidOpenTextDocumentParams) {
        self.publish(p.text_document.uri, &p.text_document.text).await;
    }

    async fn did_change(&self, mut p: DidChangeTextDocumentParams) {
        if let Some(change) = p.content_changes.pop() {
            self.publish(p.text_document.uri, &change.text).await;
        }
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }
}

#[tokio::main]
async fn main() {
    let (service, socket) = LspService::new(|client| Backend { client });
    Server::new(tokio::io::stdin(), tokio::io::stdout(), socket)
        .serve(service)
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_hardcoded_key_at_right_span() {
        let text = "const x = 1;\nconst key = \"sk-proj-AbCd012345EfGh_QwErTyUiOp6789\";";
        let diags = diagnostics_for(text);
        assert_eq!(diags.len(), 1);
        let r = diags[0].range;
        assert_eq!(r.start.line, 1);
        // `const key = "` is 13 chars → key starts at column 13
        assert_eq!(r.start.character, 13);
        assert!(r.end.character > r.start.character);
    }

    #[test]
    fn clean_code_has_no_diagnostics() {
        assert!(diagnostics_for("let total = price * qty;").is_empty());
    }
}
