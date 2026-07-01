import { invoke } from "@tauri-apps/api/core";
import type { QueryResult } from "../types";
import { useViewStore } from "../stores/viewStore";
import { useConnectionStore } from "../stores/connectionStore";

export function useQuery() {
  const store = useViewStore();

  const run = async (sql: string) => {
    const connId = useConnectionStore.getState().activeConnectionId;
    if (!connId) return;

    const vs = useViewStore.getState();
    const tabId = vs.activeTabId;

    vs.setTabLoading(tabId, true);
    vs.setTabError(tabId, null);
    vs.setTabResult(tabId, null);

    try {
      const result = await invoke<QueryResult>("run_query", { connId, sql });
      vs.setTabResult(tabId, result);
      vs.pushHistory(sql);
    } catch (e) {
      vs.setTabError(tabId, String(e));
    } finally {
      vs.setTabLoading(tabId, false);
    }
  };

  const activeTab = store.queryTabs.find(t => t.id === store.activeTabId) ?? store.queryTabs[0];

  return {
    run,
    sql: activeTab?.sql ?? "",
    setSql: (s: string) => store.setTabSql(store.activeTabId, s),
  };
}
