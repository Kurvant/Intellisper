// Clean-room embed protocol types — the message contract between an embedding host
// ("vendor") page and the embedded builder ("client"). Reconstructed solely from
// the MIT frontend's own usage (the embed route + connection-dialog + home-button
// components) — NOT from any commercially-licensed SDK. This defines the wire
// vocabulary the frontend already relies on so embedding compiles and works.
//
// Capability spec D.4 (embedding SDK). The standalone, publishable browser SDK is a
// separate deliverable; this module provides the in-app type contract the frontend
// imports as `ee-embed-sdk` (alias retained in tsconfig for compatibility).

// ---- Event name enums ----

export enum IntellisperClientEventName {
    CLIENT_INIT = 'CLIENT_INIT',
    CLIENT_AUTHENTICATION_SUCCESS = 'CLIENT_AUTHENTICATION_SUCCESS',
    CLIENT_AUTHENTICATION_FAILED = 'CLIENT_AUTHENTICATION_FAILED',
    CLIENT_CONFIGURATION_FINISHED = 'CLIENT_CONFIGURATION_FINISHED',
    CLIENT_ROUTE_CHANGED = 'CLIENT_ROUTE_CHANGED',
    CLIENT_BUILDER_HOME_BUTTON_CLICKED = 'CLIENT_BUILDER_HOME_BUTTON_CLICKED',
    CLIENT_SHOW_CONNECTION_IFRAME = 'CLIENT_SHOW_CONNECTION_IFRAME',
    CLIENT_NEW_CONNECTION_DIALOG_CLOSED = 'CLIENT_NEW_CONNECTION_DIALOG_CLOSED',
    CLIENT_CONNECTION_PIECE_NOT_FOUND = 'CLIENT_CONNECTION_PIECE_NOT_FOUND',
    CLIENT_CONNECTION_NAME_IS_INVALID = 'CLIENT_CONNECTION_NAME_IS_INVALID',
}

export enum IntellisperVendorEventName {
    VENDOR_INIT = 'VENDOR_INIT',
    VENDOR_ROUTE_CHANGED = 'VENDOR_ROUTE_CHANGED',
}

// ---- Client -> Vendor messages (posted by the embedded app) ----

export type IntellisperClientInit = {
    type: IntellisperClientEventName.CLIENT_INIT
    data: Record<string, never>
}

export type IntellisperClientAuthenticationSuccess = {
    type: IntellisperClientEventName.CLIENT_AUTHENTICATION_SUCCESS
    data: Record<string, never>
}

export type IntellisperClientAuthenticationFailed = {
    type: IntellisperClientEventName.CLIENT_AUTHENTICATION_FAILED
    data: unknown
}

export type IntellisperClientConfigurationFinished = {
    type: IntellisperClientEventName.CLIENT_CONFIGURATION_FINISHED
    data: Record<string, never>
}

export type IntellisperClientRouteChanged = {
    type: IntellisperClientEventName.CLIENT_ROUTE_CHANGED
    data: { route: string }
}

export type IntellisperClientShowConnectionIframe = {
    type: IntellisperClientEventName.CLIENT_SHOW_CONNECTION_IFRAME
    data: Record<string, never>
}

export type IntellisperNewConnectionDialogClosed = {
    type: IntellisperClientEventName.CLIENT_NEW_CONNECTION_DIALOG_CLOSED
    data: { connection?: { id: string, name: string } }
}

export type IntellisperClientConnectionPieceNotFound = {
    type: IntellisperClientEventName.CLIENT_CONNECTION_PIECE_NOT_FOUND
    data: { error: string }
}

export type IntellisperClientConnectionNameIsInvalid = {
    type: IntellisperClientEventName.CLIENT_CONNECTION_NAME_IS_INVALID
    data: { error: string }
}

// ---- Vendor -> Client messages (posted by the host page) ----

export type IntellisperVendorRouteChanged = {
    type: IntellisperVendorEventName.VENDOR_ROUTE_CHANGED
    data: { vendorRoute: string }
}

export type IntellisperVendorInit = {
    type: IntellisperVendorEventName.VENDOR_INIT
    data: {
        jwtToken: string
        mode?: 'light' | 'dark'
        locale?: string
        initialRoute?: string
        // Required: the embedded app assigns it directly to a required boolean
        // (no fallback) when applying the embed state.
        hideSidebar: boolean
        hideFlowNameInBuilder?: boolean
        // Required. `false` => navigation enabled; `true` => disabled; the special
        // 'keep_home_button_only' keeps the home button while disabling the rest.
        disableNavigationInBuilder: boolean | 'keep_home_button_only'
        hideFolders?: boolean
        hideTables?: boolean
        sdkVersion?: string
        fontUrl?: string
        fontFamily?: string
        hideExportAndImportFlow?: boolean
        emitHomeButtonClickedEvent?: boolean
        homeButtonIcon?: 'back' | 'logo'
        hideDuplicateFlow?: boolean
        hideFlowsPageNavbar?: boolean
        hidePageHeader?: boolean
    }
}

// ---- Constants ----

// Query-param keys used by the embedded new-connection dialog.
export const NEW_CONNECTION_QUERY_PARAMS = {
    connectionName: 'connectionName',
    name: 'name',
    randomId: 'randomId',
} as const
