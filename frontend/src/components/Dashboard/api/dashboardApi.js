import { apiGet } from "../../Global/api/apiClient";

export const dashboardApi = {
  resumen: (options = {}) => apiGet("dashboard_resumen", {}, options),
};
