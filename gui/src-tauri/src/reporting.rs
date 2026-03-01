/// Self-contained HTML report generator for scan results.
///
/// Produces a single .html file with embedded CSS + JS — no external
/// dependencies. Includes a severity distribution chart, filterable
/// findings table, and dark theme matching the GUI aesthetic.

use arkenar_core::{ScanConfig};
use crate::ScanFindingEvent;

pub fn generate_html_report(
    results: &[ScanFindingEvent],
    config: &ScanConfig,
    elapsed: &str,
) -> String {
    let critical: Vec<_> = results.iter().filter(|r| {
        let v = r.vuln_type.to_lowercase();
        v.contains("sqli") || v.contains("sql")
    }).collect();
    let medium: Vec<_> = results.iter().filter(|r| {
        let v = r.vuln_type.to_lowercase();
        !v.contains("sqli") && !v.contains("sql") && v != "safe"
    }).collect();

    let total = results.len();
    let crit_count = critical.len();
    let med_count = medium.len();

    let mut rows = String::new();
    for (i, r) in results.iter().enumerate() {
        let severity = if r.vuln_type.to_lowercase().contains("sql") { "Critical" } else { "Medium" };
        let sev_class = if severity == "Critical" { "sev-critical" } else { "sev-medium" };
        rows.push_str(&format!(
            r#"<tr>
                <td>{}</td>
                <td><span class="{}">{}</span></td>
                <td>{}</td>
                <td class="mono">{}</td>
                <td>{}</td>
                <td>{}ms</td>
                <td class="mono curl-cell">{}</td>
            </tr>"#,
            i + 1,
            sev_class, severity,
            html_escape(&r.vuln_type),
            html_escape(&r.url),
            r.status_code,
            r.timing_ms,
            html_escape(&r.curl_cmd),
        ));
    }

    format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Arkenar Scan Report</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ background: #0a0a0c; color: #e1e1e6; font-family: 'Inter', system-ui, sans-serif; padding: 2rem; }}
.header {{ display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }}
.header h1 {{ font-size: 1.5rem; font-weight: 700; }}
.header .badge {{ background: rgba(0,213,190,0.1); color: #00d5be; padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }}
.meta {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
.meta-card {{ background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1.25rem; }}
.meta-card .label {{ font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: #64647a; margin-bottom: 0.5rem; }}
.meta-card .value {{ font-size: 1.75rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; }}
.value.critical {{ color: #f43f5e; }}
.value.medium {{ color: #eab308; }}
.value.success {{ color: #10b981; }}
.value.accent {{ color: #00d5be; }}
table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; }}
thead th {{ text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.08); color: #64647a; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; }}
tbody td {{ padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.04); }}
tbody tr:hover {{ background: rgba(255,255,255,0.03); }}
.mono {{ font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; }}
.curl-cell {{ max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #94949e; }}
.sev-critical {{ background: rgba(244,63,94,0.1); color: #f43f5e; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }}
.sev-medium {{ background: rgba(234,179,8,0.1); color: #eab308; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }}
.panel {{ background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; margin-bottom: 2rem; }}
.panel-header {{ padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.08); font-weight: 600; font-size: 0.85rem; }}
.filter-bar {{ padding: 0.75rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.04); }}
.filter-bar input {{ background: #151518; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.5rem 0.75rem; color: #e1e1e6; font-size: 0.85rem; width: 300px; outline: none; }}
.filter-bar input:focus {{ border-color: rgba(0,213,190,0.4); }}
.empty {{ padding: 3rem; text-align: center; color: #64647a; }}
</style>
</head>
<body>
<div class="header">
    <h1>🛡 Arkenar Scan Report</h1>
    <span class="badge">v1.0.0</span>
</div>

<div class="meta">
    <div class="meta-card"><div class="label">Target</div><div class="value accent">{target}</div></div>
    <div class="meta-card"><div class="label">Total Findings</div><div class="value">{total}</div></div>
    <div class="meta-card"><div class="label">Critical</div><div class="value critical">{crit}</div></div>
    <div class="meta-card"><div class="label">Medium</div><div class="value medium">{med}</div></div>
    <div class="meta-card"><div class="label">Elapsed</div><div class="value">{elapsed}</div></div>
    <div class="meta-card"><div class="label">Mode</div><div class="value">{mode}</div></div>
</div>

<div class="panel">
    <div class="panel-header">Findings</div>
    <div class="filter-bar"><input type="text" id="filter" placeholder="Filter by type, URL, or payload..." oninput="filterTable()"></div>
    {table_or_empty}
</div>

<script>
function filterTable() {{
    const q = document.getElementById('filter').value.toLowerCase();
    document.querySelectorAll('tbody tr').forEach(r => {{
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    }});
}}
</script>
</body>
</html>"#,
        target = html_escape(&config.target),
        total = total,
        crit = crit_count,
        med = med_count,
        elapsed = html_escape(elapsed),
        mode = html_escape(&config.mode),
        table_or_empty = if total == 0 {
            r#"<div class="empty">No findings to display.</div>"#.to_string()
        } else {
            format!(r#"<table><thead><tr><th>#</th><th>Severity</th><th>Type</th><th>URL</th><th>Status</th><th>Timing</th><th>Reproduce</th></tr></thead><tbody>{}</tbody></table>"#, rows)
        },
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
