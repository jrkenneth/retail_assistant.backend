import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import { asyncHandler, paginate, parseInteger, parsePagination } from "../utils.js";

const router = Router();

function buildProductsQuery() {
  return db("products")
    .innerJoin("product_categories", "products.category_id", "product_categories.id")
    .select(
      "products.id",
      "products.sku",
      "products.name",
      "products.description",
      "products.price",
      "products.original_price",
      "products.stock_quantity",
      "products.availability_status",
      "products.warranty_duration",
      "products.return_window_days",
      "products.is_promotion_eligible",
      "products.specifications",
      "products.created_at",
      "products.updated_at",
      "product_categories.name as category_name",
      "product_categories.slug as category_slug"
    );
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const availabilityStatus =
      typeof req.query.availability_status === "string" ? req.query.availability_status.trim() : "";
    const promotionEligible =
      typeof req.query.is_promotion_eligible === "string" ? req.query.is_promotion_eligible.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const minPrice = parseInteger(req.query.min_price, "min_price");
    const maxPrice = parseInteger(req.query.max_price, "max_price");

    const query = buildProductsQuery();

    if (category) {
      query.where((builder) => {
        builder.whereILike("product_categories.name", `%${category}%`);
        builder.orWhereILike("product_categories.slug", `%${category}%`);
      });
    }

    if (availabilityStatus) {
      query.where("products.availability_status", availabilityStatus);
    }

    if (promotionEligible === "true") {
      query.where("products.is_promotion_eligible", true);
    }

    if (promotionEligible === "false") {
      query.where("products.is_promotion_eligible", false);
    }

    if (typeof minPrice === "number") {
      query.where("products.price", ">=", minPrice);
    }

    if (typeof maxPrice === "number") {
      query.where("products.price", "<=", maxPrice);
    }

    if (search) {
      query.where((builder) => {
        builder.whereILike("products.name", `%${search}%`);
        builder.orWhereILike("products.description", `%${search}%`);
        builder.orWhereILike("products.sku", `%${search}%`);
      });
    }

    query.orderBy("products.created_at", "desc");

    const result = await paginate(query, pagination, "products.id");
    res.status(200).json(result);
  })
);

router.get(
  "/:sku",
  asyncHandler(async (req, res) => {
    const product = await buildProductsQuery()
      .where("products.sku", req.params.sku)
      .first();

    if (!product) {
      throw notFound("Product not found");
    }

    res.status(200).json({ data: product });
  })
);

export default router;
