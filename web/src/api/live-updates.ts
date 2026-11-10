import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "./provider";
import { keysForTopics } from "./queries";

/**
 * Subscribes to api/events and invalidates queries by topic.
 * Returns whether the live connection is currently up (false drives the offline banner).
 */
export function useLiveUpdates(): boolean {
  const api = useApi();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    return api.subscribe({
      onChange: (event) => {
        for (const queryKey of keysForTopics(event.topics)) {
          void queryClient.invalidateQueries({ queryKey });
        }
      },
      onConnection: (up) => {
        setConnected(up);
        // Missed events while disconnected: resync everything on reconnect.
        if (up) void queryClient.invalidateQueries();
      },
    });
  }, [api, queryClient]);

  return connected;
}
