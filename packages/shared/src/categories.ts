import { z } from "zod";

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(50),
  icon: z.string().trim().max(40).optional(),
  color: hexColorSchema.optional(),
  /** Set to make this a subcategory. Only one level of nesting is allowed. */
  parentId: z.string().uuid().nullable().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/** The API returns categories as a flat list; use buildCategoryTree for nesting. */
export interface CategoryDto {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
}

export interface CategoryNode extends CategoryDto {
  children: CategoryDto[];
}

/** Top-level categories (alphabetical) with their subcategories. */
export function buildCategoryTree(categories: CategoryDto[]): CategoryNode[] {
  const byName = (a: CategoryDto, b: CategoryDto) => a.name.localeCompare(b.name);
  const roots = categories.filter((c) => !c.parentId).sort(byName);
  return roots.map((r) => ({
    ...r,
    children: categories.filter((c) => c.parentId === r.id).sort(byName),
  }));
}

export interface DefaultCategory {
  name: string;
  icon: string;
  color: string;
  children: string[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Food & Dining", icon: "utensils", color: "#E4572E", children: ["Restaurants", "Food delivery", "Coffee & snacks", "Office meals"] },
  { name: "Groceries", icon: "shopping-basket", color: "#F3A712", children: ["Supermarket", "Vegetables & fruits", "Dairy", "Meat & fish"] },
  { name: "Transport", icon: "car", color: "#2E86AB", children: ["Fuel", "Cab & auto", "Public transport", "Parking & tolls", "Vehicle service"] },
  { name: "Housing & Rent", icon: "home", color: "#6C4AB6", children: ["Rent", "Maintenance", "Repairs", "Furnishing"] },
  { name: "Utilities", icon: "zap", color: "#29BF12", children: ["Electricity", "Internet", "Mobile", "Water", "Gas"] },
  { name: "Shopping", icon: "shopping-bag", color: "#D7263D", children: ["Clothing", "Electronics", "Home & kitchen", "Personal care"] },
  { name: "Entertainment", icon: "film", color: "#1B998B", children: ["Movies", "Subscriptions", "Events", "Games"] },
  { name: "Health", icon: "heart-pulse", color: "#C5283D", children: ["Pharmacy", "Doctor", "Fitness", "Insurance"] },
  { name: "Travel", icon: "plane", color: "#3F88C5", children: ["Flights", "Trains & buses", "Hotels", "Activities"] },
  { name: "Education", icon: "graduation-cap", color: "#8A6FDF", children: ["Courses", "Books", "School fees"] },
  { name: "Other", icon: "circle", color: "#7D8491", children: [] },
];
