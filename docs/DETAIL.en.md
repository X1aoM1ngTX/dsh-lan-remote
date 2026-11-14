# LAN remote

Use this computer's DSH from another computer's browser on the same LAN, and keep the links of other computers' DSH for one-click access. It appears under **Settings → LAN remote**.

## What it does

- **Share this computer**: a small HTTP/WebSocket gateway on `0.0.0.0:<port>` (4778 by default) transparently proxies to this machine's DSH Web server on `127.0.0.1:50590`. A share link looks like `http://192.168.1.8:4778/?lan=ABCD-1234`.
- **Other computers**: save links, probe whether a peer is reachable, open it in a new tab.
- **Access code**: resettable at any time; the port is editable.
- **Durable state**: port, code, sharing switch and peer list persist across DSH restarts.

## Usage

1. Install the plugin on both computers.
2. On the computer you want to reach: Settings → LAN remote, turn on *Share this computer*, copy the link.
3. On the computer you are sitting at: paste the link under *Other computers*, press *Test*, then *Connect*.
4. If it cannot connect, run the administrator PowerShell firewall command shown on the page.

## How it works

The gateway does not move DSH's bind address and does not implement a login:

1. The browser talks to the gateway, which rewrites `Host`, `Origin` and `Referer` to the loopback authority and forwards.
2. The gateway checks `?lan=<code>` and exchanges it for the DSH process's own launch token.
3. DSH mints its own browser cookie; every later HTTP and WebSocket request is authenticated by DSH.

## Security

The share link is the credential. While sharing is on, anyone on the LAN with the link can use this DSH as if they were at this computer: read and write files, run commands, use the signed-in account. Turn it on only in a trusted network. Resetting the code invalidates old links but does not sign out browsers that already authenticated (cookies last up to 30 days). The gateway serves plain HTTP.
