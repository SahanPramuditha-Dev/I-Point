import { useEffect, useState } from "react";
import api from "../lib/api";

export function useFetch(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get(path)
      .then((res) => active && setData(res.data))
      .catch((e) => {
        const message = e.response
          ? `${e.response.status} ${e.response.data?.detail || e.response.statusText || e.message}`
          : e.request
            ? "Network Error: Unable to reach the backend. Ensure the API server is running at http://127.0.0.1:8000"
            : e.message;
        setError(message);
      })
      .finally(() => setLoading(false));
    return () => { active = false; };
  }, [path]);

  return { data, loading, error, setData };
}
