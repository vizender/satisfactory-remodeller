import type { ContainerVariant } from "@/types/graph";

export const CONTAINER_VARIANT_STANDARD: ContainerVariant = "standard";
export const CONTAINER_VARIANT_INDUSTRIAL: ContainerVariant = "industrial";

export const CONTAINER_SLOT_COUNT: Record<ContainerVariant, number> = {
  standard: 1,
  industrial: 2,
};

export const CONTAINER_BUILDING_CLASS: Record<ContainerVariant, string> = {
  standard: "Desc_StorageContainerMk1_C",
  industrial: "Desc_StorageContainerMk2_C",
};

export const CONTAINER_DEFAULT_LABEL: Record<ContainerVariant, string> = {
  standard: "Storage Container",
  industrial: "Industrial Storage Container",
};
