# Block Types & Classifications

## Locations

| Location | Use when | Examples |
|---|---|---|
| `community/` | Third-party integration anyone can use | Slack, Notion, Stripe |
| `core/` | Built-in platform utility, not app-specific | HTTP, Store, Math Helper |
| `custom/` | Private block for a specific customer | Internal CRM, proprietary API |

Use `community/` for almost all work.

## Package Naming

| Location | Format | Example |
|---|---|---|
| `community/` | `@intelblocks/block-<name>` | `@intelblocks/block-slack` |
| `core/` | `@intelblocks/block-<name>` | `@intelblocks/block-http` |
| `custom/` | Any npm-valid name | `@mycompany/block-crm` |

## BlockCategory Values

```typescript
import { BlockCategory } from '@intelblocks/shared';
```

| Category | Use for |
|---|---|
| `ARTIFICIAL_INTELLIGENCE` | AI/LLM services (OpenAI, Anthropic) |
| `COMMUNICATION` | Chat, email, messaging (Slack, Gmail, Twilio) |
| `COMMERCE` | E-commerce (Shopify, WooCommerce) |
| `ACCOUNTING` | Finance/accounting (QuickBooks, Xero) |
| `BUSINESS_INTELLIGENCE` | Analytics, reporting (Google Analytics) |
| `CONTENT_AND_FILES` | Files, docs (Google Drive, Notion, Dropbox) |
| `DEVELOPER_TOOLS` | Dev tools (GitHub, Jira, Linear) |
| `CUSTOMER_SUPPORT` | Support (Intercom, Zendesk) |
| `FORMS_AND_SURVEYS` | Forms (Typeform, Google Forms) |
| `HUMAN_RESOURCES` | HR tools (BambooHR, Workday) |
| `MARKETING` | Marketing (Mailchimp, HubSpot Marketing) |
| `PAYMENT_PROCESSING` | Payments (Stripe, PayPal) |
| `PRODUCTIVITY` | General productivity (Trello, Airtable) |
| `SALES_AND_CRM` | CRM/Sales (Salesforce, HubSpot CRM) |
| `CORE` | Platform utilities (core/ blocks only) |
| `FLOW_CONTROL` | Flow logic (core/ blocks only) |
| `UNIVERSAL_AI` | Universal AI connectors (core/ blocks only) |

Multiple categories allowed: `categories: [BlockCategory.COMMERCE, BlockCategory.PAYMENT_PROCESSING]`

## Core Blocks — Do Not Recreate

| Block | What it does |
|---|---|
| `http` | Generic HTTP requests |
| `store` | Key-value storage within flows |
| `schedule` | Cron-based scheduling trigger |
| `delay` | Pause flow execution |
| `webhook` | Generic webhook trigger |
| `manual-trigger` | Manual flow execution |
| `data-mapper` | Transform/map data |
| `math-helper` | Math operations |
| `text-helper` | String operations |
| `date-helper` | Date/time operations |
| `file-helper` | File operations |
| `approval` | Human approval steps |
| `smtp` | Send emails via SMTP |
| `sftp` | SFTP file transfers |
| `csv` | CSV parsing/generation |
| `pdf` | PDF generation |
| `qrcode` | QR code generation |
| `tables` | Intellisper Tables integration |
| `subflows` | Call other flows |
| `connections` | Manage connections |
| `forms` | Intellisper Forms |
| `graphql` | Generic GraphQL requests |
| `crypto` | Cryptography utilities |
| `xml` | XML parsing |
| `image-helper` | Image processing |
