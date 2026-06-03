# GitHub Action image: builds the arkenar CLI and runs it as the entrypoint.
FROM rust:1-slim AS build
WORKDIR /src
COPY . .
RUN cargo build --release -p arkenar

FROM debian:stable-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/arkenar /usr/local/bin/arkenar
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
