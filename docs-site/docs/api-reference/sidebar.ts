import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "api-reference/intellisper-documentation",
    },
    {
      type: "category",
      label: "folders",
      items: [
        {
          type: "doc",
          id: "api-reference/create-a-folder",
          label: "Create a folder",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/list-folders",
          label: "List folders",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/update-a-folder",
          label: "Update a folder",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/get-a-folder",
          label: "Get a folder",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-folder",
          label: "Delete a folder",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "flows",
      items: [
        {
          type: "doc",
          id: "api-reference/create-a-flow",
          label: "Create a flow",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/list-flows",
          label: "List flows",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/update-a-flow",
          label: "Update a flow",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/get-a-flow",
          label: "Get a flow",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-flow",
          label: "Delete a flow",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api-reference/export-a-flow-as-a-template",
          label: "Export a flow as a template",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "sample-data",
      items: [
        {
          type: "doc",
          id: "api-reference/run-a-step-to-produce-sample-data",
          label: "Run a step to produce sample data",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/get-sample-data",
          label: "Get sample data",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "flow-runs",
      items: [
        {
          type: "doc",
          id: "api-reference/list-flow-runs",
          label: "List flow runs",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/count-flow-runs-by-status",
          label: "Count flow runs by status",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/get-a-flow-run",
          label: "Get a flow run",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/cancel-flow-runs",
          label: "Cancel flow runs",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "app-connections",
      items: [
        {
          type: "doc",
          id: "api-reference/upsert-an-app-connection",
          label: "Upsert an app connection",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/list-app-connections",
          label: "List app connections",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/update-an-app-connection",
          label: "Update an app connection",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/delete-an-app-connection",
          label: "Delete an app connection",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api-reference/list-app-connection-owners",
          label: "List app connection owners",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/replace-app-connections",
          label: "Replace app connections",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/get-an-o-auth-2-authorization-url",
          label: "Get an OAuth2 authorization URL",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "platforms",
      items: [
        {
          type: "doc",
          id: "api-reference/get-a-platform",
          label: "Get a platform",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "mcp",
      items: [
        {
          type: "doc",
          id: "api-reference/get-an-mcp-server",
          label: "Get an MCP server",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/update-the-project-mcp-server",
          label: "Update the project MCP server",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/rotate-the-mcp-server-token",
          label: "Rotate the MCP server token",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/get-the-platform-mcp-server",
          label: "Get the platform MCP server",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/update-the-platform-mcp-server",
          label: "Update the platform MCP server",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/rotate-the-platform-mcp-server-token",
          label: "Rotate the platform MCP server token",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "mcp-oauth",
      items: [
        {
          type: "doc",
          id: "api-reference/approve-an-mcp-o-auth-authorization-request",
          label: "Approve an MCP OAuth authorization request",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "agent",
      items: [
        {
          type: "doc",
          id: "api-reference/probe-an-agent-mcp-tool-server",
          label: "Probe an agent MCP tool server",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "users",
      items: [
        {
          type: "doc",
          id: "api-reference/list-users",
          label: "List users",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/update-a-user",
          label: "Update a user",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-user",
          label: "Delete a user",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "user-invitations",
      items: [
        {
          type: "doc",
          id: "api-reference/send-a-user-invitation",
          label: "Send a user invitation",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/list-user-invitations",
          label: "List user invitations",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-user-invitation",
          label: "Delete a user invitation",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "worker-machines",
      items: [
        {
          type: "doc",
          id: "api-reference/get-worker-queue-metrics",
          label: "Get worker queue metrics",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "tables",
      items: [
        {
          type: "doc",
          id: "api-reference/update-a-table",
          label: "Update a table",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-table",
          label: "Delete a table",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api-reference/get-a-table",
          label: "Get a table",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/list-tables",
          label: "List tables",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/export-a-table-as-a-template",
          label: "Export a table as a template",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/count-tables",
          label: "Count tables",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/export-a-table",
          label: "Export a table",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/create-a-table-webhook",
          label: "Create a table webhook",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-table-webhook",
          label: "Delete a table webhook",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api-reference/clear-a-table",
          label: "Clear a table",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "records",
      items: [
        {
          type: "doc",
          id: "api-reference/update-a-record",
          label: "Update a record",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/delete-records",
          label: "Delete records",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api-reference/list-records",
          label: "List records",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "knowledge-base",
      items: [
        {
          type: "doc",
          id: "api-reference/register-a-knowledge-base-file",
          label: "Register a knowledge base file",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/list-knowledge-base-files",
          label: "List knowledge base files",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/upload-a-knowledge-base-file",
          label: "Upload a knowledge base file",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-knowledge-base-file",
          label: "Delete a knowledge base file",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api-reference/count-knowledge-base-file-chunks",
          label: "Count knowledge base file chunks",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/extract-knowledge-base-file-chunks",
          label: "Extract knowledge base file chunks",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/store-knowledge-base-chunks",
          label: "Store knowledge base chunks",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/list-knowledge-base-file-chunks",
          label: "List knowledge base file chunks",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/search-the-knowledge-base",
          label: "Search the knowledge base",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "templates",
      items: [
        {
          type: "doc",
          id: "api-reference/get-a-template",
          label: "Get a template",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/update-a-template",
          label: "Update a template",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-template",
          label: "Delete a template",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api-reference/list-template-categories",
          label: "List template categories",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/list-templates",
          label: "List templates",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/create-a-template",
          label: "Create a template",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "projects",
      items: [
        {
          type: "doc",
          id: "api-reference/list-projects",
          label: "List projects",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/create-a-project",
          label: "Create a project",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/update-a-project",
          label: "Update a project",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-project",
          label: "Delete a project",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "project-members",
      items: [
        {
          type: "doc",
          id: "api-reference/list-project-members",
          label: "List project members",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/remove-a-project-member",
          label: "Remove a project member",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "git-repos",
      items: [
        {
          type: "doc",
          id: "api-reference/configure-git-sync",
          label: "Configure git sync",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "project-releases",
      items: [
        {
          type: "doc",
          id: "api-reference/create-a-project-release",
          label: "Create a project release",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "global-connections",
      items: [
        {
          type: "doc",
          id: "api-reference/upsert-a-global-connection",
          label: "Upsert a global connection",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/list-global-connections",
          label: "List global connections",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/update-a-global-connection",
          label: "Update a global connection",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/delete-a-global-connection",
          label: "Delete a global connection",
          className: "api-method delete",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
