# Contributing to ARKENAR

Thanks for taking the time to contribute to ARKENAR. This tool is built for the security community, and any help to make it faster, smarter, or more effective is genuinely appreciated. 

Whether you are fixing a typo, reporting a bug, or adding a complex WAF bypass payload, your input matters.

## How to Help

### Adding New Payloads
The core strength of ARKENAR is its mutation engine. If you have crafted a payload that successfully bypasses modern WAFs, we would love to add it. 

To contribute a payload, navigate to the `src/payloads/` directory and add it to the appropriate list. If your payload requires specific injection logic, you might also need to tweak the mutation engine in the `src/core/` directory.

### Reporting Bugs
If you find a bug or something breaks, please let me know. Head over to the Issues tab and open a new issue. 

To help us track down the problem quickly, please include:
* Your operating system (Windows, Linux, or macOS).
* Your current Rust version (you can find this by running `rustc --version`).
* Clear steps on how to reproduce the error.
* Any relevant error logs or terminal output.

### Submitting Code
If you want to write code for the project, here is our standard workflow:

1. Fork the repository and create a new branch for your feature or fix (e.g., `git checkout -b feature/new-scanner`).
2. Write your code and make sure to test it locally to ensure it compiles without errors.
3. Since this is a Rust project, please run `cargo fmt` to keep the code style consistent, and `cargo clippy` to catch any common mistakes.
4. Commit your changes with a clear message explaining what you did.
5. Push the changes to your fork and open a Pull Request.

## A Quick Note on Ethics
Please keep things professional and respectful when interacting with others in the issues or pull requests. 

Also, ARKENAR is an offensive security tool designed strictly for authorized testing and educational purposes. Do not submit malicious code, backdoors, or features intended to harm users.

I am human after all, so please expect some bugs or weaknesses in the tool. I would greatly appreciate your help in fixing them.

Thanks again for your interest in improving ARKENAR.
