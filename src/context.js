import React from "react";

export const AppCtx = React.createContext(null);

export const useApp = () => {
  const c = React.useContext(AppCtx);
  if (!c) throw new Error("useApp must be inside AppCtx.Provider");
  return c;
};
