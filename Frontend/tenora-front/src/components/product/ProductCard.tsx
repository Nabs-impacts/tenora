import { Link } from "react-router-dom";
import { Product, formatXOF, productsApi } from "@/lib/api";
import { Zap, ArrowUpRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function ProductCard({ product }: { product: Product }) {
  const qc = useQueryClient();
  const hasDiscount = !!product.discount_percent && product.discount_percent > 0;

  const warmCache = () => {
    qc.setQueryData(["product", product.id], product);
    qc.prefetchQuery({
      queryKey: ["product", product.id],
      queryFn: () => productsApi.getProduct(product.id).then((r) => r.data),
      staleTime: 2 * 60_000,
    });
  };

  return (
    <Link
      to={`/produit/${product.id}`}
      className="group block brut-card overflow-hidden"
      onMouseEnter={warmCache}
      onFocus={warmCache}
      onTouchStart={warmCache}
    >
      <div className="relative aspect-square bg-muted overflow-hidden border-b-2 border-border">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground">
            <Zap aria-hidden="true" className="size-10 opacity-30" />
          </div>
        )}
        {hasDiscount && (
          <span className="absolute top-2 left-2 chip bg-destructive text-destructive-foreground border-destructive">
            -{product.discount_percent}%
          </span>
        )}
        {product.stock > 5 && (
          <span className="absolute top-2 right-2 chip bg-success text-success-foreground border-success">
            En stock
          </span>
        )}
        {product.stock > 0 && product.stock <= 5 && (
          <span className="absolute top-2 right-2 chip bg-warning text-warning-foreground border-warning">
            Plus que {product.stock}
          </span>
        )}
        <ArrowUpRight
          aria-hidden="true"
          className="absolute bottom-2 right-2 size-5 text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
      <div className="p-3 sm:p-4">
        {/* Titre : 2 lignes max, mots cassés proprement (plus de "…" brutal). */}
        <h3
          className="font-semibold text-sm sm:text-base leading-snug normal-case tracking-normal break-words [hyphens:auto]"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: "2.6em",
          }}
          title={product.name}
        >
          {product.name}
        </h3>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="font-display font-bold text-2xl text-primary tabular-nums">
            {formatXOF(product.final_price ?? product.price).replace("FCFA", "")}
            <span className="text-xs text-muted-foreground ml-1">F</span>
          </span>
          {hasDiscount && (
            <span className="text-xs text-muted-foreground line-through tabular-nums">
              {formatXOF(product.price)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
