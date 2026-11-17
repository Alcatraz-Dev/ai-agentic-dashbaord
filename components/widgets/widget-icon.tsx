import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  Clock3,
  Cpu,
  Database,
  DollarSign,
  FileText,
  Globe2,
  Layers,
  Mail,
  Server,
  ShoppingBag,
  Target,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { WidgetIconKey } from "@/lib/widget-types";

/** The only icons a widget can use, so a stored key always renders. */
const ICONS: Record<WidgetIconKey, LucideIcon> = {
  activity: Activity,
  bars: BarChart3,
  bell: Bell,
  calendar: CalendarDays,
  clock: Clock3,
  cpu: Cpu,
  database: Database,
  dollar: DollarSign,
  file: FileText,
  globe: Globe2,
  layers: Layers,
  mail: Mail,
  server: Server,
  shopping: ShoppingBag,
  target: Target,
  trending: TrendingUp,
  users: Users,
  zap: Zap,
};

export function getWidgetIcon(key: string | null | undefined): LucideIcon {
  return ICONS[key as WidgetIconKey] ?? Activity;
}
