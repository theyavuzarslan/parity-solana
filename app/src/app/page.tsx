import { forwardPrice, VOL } from "advisor";
export default function Page() {
  return <p>{forwardPrice(41, 0.0425, 360, 0.4, 365, 30).toFixed(4)} {VOL["USD/TRY"].sigmaAnnual}</p>;
}
