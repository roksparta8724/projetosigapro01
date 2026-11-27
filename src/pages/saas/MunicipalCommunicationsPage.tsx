import {PortalFrame} from "@/components/platform/PortalFrame";
import {PageShell} from "@/components/platform/PageShell";
import {MunicipalTiAdministration} from "./MunicipalTiAdministration";
import "./municipal-ti.css";
export function MunicipalCommunicationsPage(){return <PortalFrame eyebrow="Comunicação institucional" title="Comunicações oficiais"><PageShell><div className="ti-workspace"><MunicipalTiAdministration mode="docs"/></div></PageShell></PortalFrame>;}
