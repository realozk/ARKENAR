# Contributing to ARKENAR

Thanks for taking the time to contribute to ARKENAR. This tool is built for the security community, and any help to make it more useful or reliable is genuinely appreciated.

Whether you're fixing a typo, reporting a bug, or adding a WAF bypass payload, your input matters.

## How to Help

### Adding New Payloads
The core of ARKENAR is its mutation engine. If you have a payload that successfully bypasses WAFs, I'd like to add it.

To contribute a payload, navigate to the `src/payloads/` directory and add it to the right list. If your payload requires specific injection logic, you might also need to adjust the mutation engine in `src/core/`.

### Reporting Bugs
If you find a bug or something breaks, please open an issue on the Issues tab.

To help track down the problem quickly, include:
* Your operating system (Windows, Linux, or macOS).
* Your current Rust version (`rustc --version`).
* Clear steps to reproduce the error.
* Any relevant error logs or terminal output.

### Submitting Code
If you want to write code for the project, here's the workflow:

1. Fork the repository and create a new branch for your feature or fix (e.g., `git checkout -b feature/new-scanner`).
2. Write your code and test it locally to make sure it compiles.
3. Run `cargo fmt` to keep the code style consistent, and `cargo clippy` to catch common mistakes.
4. Commit your changes with a clear message explaining what you did.
5. Push to your fork and open a Pull Request.

## A Quick Note on Ethics
Please keep things professional when interacting in issues or pull requests.

ARKENAR is an offensive security tool designed strictly for authorized testing and educational purposes. Don't submit malicious code, backdoors, or features intended to harm users.

I'm human, so expect bugs. I'd genuinely appreciate your help finding and fixing them.

Thanks for your interest in improving ARKENAR.
