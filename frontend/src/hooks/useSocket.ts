import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/lib/auth";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function useSocket() {
  // Create socket synchronously so listeners can be attached on first render.
  const socketRef = useRef<Socket>(
    io(SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    }),
  );
  const { profile, role } = useAuth();

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket.connected) {
      socket.connect();
    }

    const joinRooms = () => {
      if (role === "admin") {
        socket.emit("join-admin");
        console.log("[Socket] joined admin room");
      } else if (profile?.shop_id) {
        socket.emit("join-shop", profile.shop_id);
        console.log("[Socket] joined shop room:", profile.shop_id);
      }
    };

    socket.on("connect", () => {
      console.log("[Socket] connected:", socket.id);
      joinRooms();
    });

    // Re-join rooms after any reconnect
    socket.on("reconnect", joinRooms);

    socket.on("disconnect", (reason) => {
      console.log("[Socket] disconnected:", reason);
    });

    socket.on("connect_error", (e) => {
      console.error("[Socket] connect_error:", e.message);
    });

    return () => {
      socket.off("connect");
      socket.off("reconnect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.disconnect();
    };
  }, [profile, role]);

  /**
   * Register an event listener on the socket.
   * Safe to call before the socket connects — it registers on the socket object
   * which persists across connect/disconnect cycles.
   * Returns an unsubscribe function.
   */
  const on = useCallback(<T = any>(event: string, callback: (data: T) => void) => {
    const socket = socketRef.current;
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, []); // stable — socketRef.current is always the same socket instance within a mount

  // ── Typed convenience listeners ──────────────────────────────────────────
  const onDispatchUpdate = useCallback((cb: (data: any) => void) => on("dispatchUpdate", cb), [on]);

  const onInventoryUpdated = useCallback(
    (cb: () => void) => on<void>("inventoryUpdated", cb),
    [on],
  );

  const onWarehouseUpdated = useCallback(
    (cb: (data: any) => void) => on("warehouseUpdated", cb),
    [on],
  );

  const onMedicinesUpdated = useCallback(
    (cb: (data: any) => void) => on("medicinesUpdated", cb),
    [on],
  );

  const onShopStatusChanged = useCallback(
    (cb: (data: any) => void) => on("shopStatusChanged", cb),
    [on],
  );

  const onNewSale = useCallback((cb: (data: any) => void) => on("newSale", cb), [on]);

  const onSellingPriceAlert = useCallback(
    (cb: (data: any) => void) => on("sellingPriceAlert", cb),
    [on],
  );

  return {
    socket: socketRef.current,
    on,
    onDispatchUpdate,
    onInventoryUpdated,
    onWarehouseUpdated,
    onMedicinesUpdated,
    onShopStatusChanged,
    onNewSale,
    onSellingPriceAlert,
  };
}
