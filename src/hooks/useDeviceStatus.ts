import { useEffect, useState } from "react";
import { getDeviceStatus, subscribeDeviceStatus, DeviceStatus } from "@/lib/deviceStatus";

/** Live network + battery status for any component. */
export function useDeviceStatus(): DeviceStatus {
  const [s, setS] = useState<DeviceStatus>(getDeviceStatus());
  useEffect(() => subscribeDeviceStatus(setS), []);
  return s;
}
