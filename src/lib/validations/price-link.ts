import { z } from "zod";

const optionalText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
  z.string().trim().optional()
);

// Hidden form fields written by the "Giá thị trường (TCGplayer)" picker.
export const priceLinkFields = {
  priceSource: optionalText,
  priceSourceLabel: optionalText,
  priceSourceUrl: optionalText,
  priceOptOut: optionalText,
};
