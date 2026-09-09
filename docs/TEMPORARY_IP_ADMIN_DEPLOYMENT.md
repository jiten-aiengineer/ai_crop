# Temporary EC2 administration address

Until a Crop Life domain is available, the intended temporary address is:

```text
http://44.213.218.185:8080/admin/portal
```

The topology is deliberately limited:

```text
Internet :80   → Nginx → 127.0.0.1:3000 (farmer application)
Internet :8080 → Nginx → 127.0.0.1:3100 (administration portal)
                               └→ 127.0.0.1:8000 (private FastAPI)
                               └→ 127.0.0.1:5434 (private PostgreSQL)
```

## Important temporary limitation

The portal is published on an HTTP IP address only for layout and deployment validation. Microsoft Entra sign-in cannot be safely enabled on an HTTP IP address: a non-localhost Entra redirect URI requires HTTPS. Therefore the portal stays in its secure configuration screen until an HTTPS hostname and Entra registration are provided.

Do not add a shared password or a browser-side administrator key merely to bypass this limitation. Once a domain is available, the same application becomes the production portal by changing Nginx hostname routing and the environment values documented in `ADMIN_OPERATIONS_PORTAL.md`.

## EC2 network rule

Only these ports should be available externally:

| Port | Use | Recommended access |
|---:|---|---|
| 22 | SSH | Administrator IP addresses only |
| 80 | Farmer application | Public during pilot |
| 443 | Future HTTPS | Public once certificate is configured |
| 8080 | Temporary admin portal | Company/admin IP addresses only; public only for short testing if necessary |

Node ports 3000/3100, FastAPI port 8000 and PostgreSQL port 5434 are bound to loopback and must not be opened in the EC2 security group.
