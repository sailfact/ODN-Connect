/**
 * Shared protocol types for IPC between the Electron app and the elevated tunnel service.
 *
 * Communication uses JSON messages delimited by newlines over a named pipe (Windows)
 * or Unix domain socket (Linux/macOS).
 */

/** Commands the service accepts. */
export type ServiceCommand = 'connect' | 'disconnect' | 'status' | 'interfaces' | 'ping'

/** A request sent from the Electron app to the tunnel service. */
export interface ServiceRequest {
  /** Unique request ID for correlating responses. */
  id: string
  /** The operation to perform. */
  command: ServiceCommand
  /** Command-specific arguments. */
  args?: {
    /** Absolute path to a .conf file (for 'connect'). */
    configPath?: string
    /** WireGuard interface/tunnel name (for 'disconnect'). */
    interfaceName?: string
  }
}

/** A response sent from the tunnel service back to the Electron app. */
export interface ServiceResponse {
  /** Matches the request ID. */
  id: string
  /** Whether the operation succeeded. */
  success: boolean
  /** Error message if success is false. */
  error?: string
  /** Command-specific result data. */
  data?: unknown
}

/** Pipe/socket paths by platform. */
export const SERVICE_PIPE_PATH =
  process.platform === 'win32'
    ? '\\\\.\\pipe\\odn-tunnel-service'
    : '/var/run/odn-tunnel-service.sock'
