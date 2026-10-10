import { useCallback, useState } from "react";
import { api } from "./api.js";

// 특허별 권리 현황(법적 상태 + 등록사항) 조회 상태 { [출원번호]: { data?, loading?, error? } }
export function useRights() {
  const [map, setMap] = useState({});
  const load = useCallback(async (app, refresh = false) => {
    setMap(m => ({ ...m, [app]: { data: m[app]?.data, loading: true } }));
    try {
      const data = await api.rights(app, refresh);
      setMap(m => ({ ...m, [app]: { data } }));
      return data;
    } catch (e) {
      setMap(m => ({ ...m, [app]: { error: e.message } }));
      return null;
    }
  }, []);
  return [map, load];
}
