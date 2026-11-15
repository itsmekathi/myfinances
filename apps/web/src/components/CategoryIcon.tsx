import {
  Bitcoin,
  Briefcase,
  Car,
  ChartPie,
  Circle,
  Film,
  Gem,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Percent,
  PiggyBank,
  Plane,
  RotateCcw,
  ShoppingBag,
  ShoppingBasket,
  TrendingUp,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  utensils: Utensils,
  'shopping-basket': ShoppingBasket,
  car: Car,
  home: Home,
  zap: Zap,
  'shopping-bag': ShoppingBag,
  film: Film,
  'heart-pulse': HeartPulse,
  plane: Plane,
  'graduation-cap': GraduationCap,
  circle: Circle,
  // Income and investment defaults
  briefcase: Briefcase,
  laptop: Laptop,
  percent: Percent,
  'trending-up': TrendingUp,
  'rotate-ccw': RotateCcw,
  gift: Gift,
  'pie-chart': ChartPie,
  landmark: Landmark,
  'piggy-bank': PiggyBank,
  gem: Gem,
  bitcoin: Bitcoin,
};

export function CategoryIcon({ icon, color }: { icon?: string | null; color?: string | null }) {
  const Icon = (icon && icons[icon]) || Circle;
  const c = color ?? '#64748b';
  return (
    <span
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: `${c}1f`, color: c }}
    >
      <Icon className="size-4.5" />
    </span>
  );
}
