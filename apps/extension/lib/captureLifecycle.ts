export interface ReconnectDecision {
  intentionalStop: boolean;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
}

export function shouldReconnectAfterClose(decision: ReconnectDecision): boolean {
  return !decision.intentionalStop && decision.reconnectAttempt < decision.maxReconnectAttempts;
}

export function stopMediaStreamTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach(track => track.stop());
}
