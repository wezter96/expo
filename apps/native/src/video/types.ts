/** Props shared by the native (LiveKit) and web (stub) VideoCall implementations. */
export type VideoCallProps = {
  /** LiveKit access token minted by the server. */
  token: string;
  /** LiveKit server URL (ws(s)://…). */
  url: string;
  /** Who/what we're calling — shown in the UI. */
  name: string;
  /** Called when the user leaves or the room disconnects. */
  onLeave: () => void;
};
