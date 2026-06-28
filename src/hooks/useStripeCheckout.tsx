import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { StripeEmbeddedCheckout } from "@/components/payments/StripeEmbeddedCheckout";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface CheckoutOptions {
  priceId: string;
  quantity?: number;
  customerEmail?: string;
  userId?: string;
  returnUrl?: string;
}

export function useStripeCheckout() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<CheckoutOptions | null>(null);

  const openCheckout = useCallback((opts: CheckoutOptions) => {
    setOptions(opts);
    setIsOpen(true);
  }, []);

  const closeCheckout = useCallback(() => {
    setIsOpen(false);
    setOptions(null);
  }, []);

  const handleCheckoutComplete = useCallback(() => {
    closeCheckout();
    navigate("/app/settings?tab=billing&checkout=success");
  }, [closeCheckout, navigate]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "RADARIQ_CHECKOUT_COMPLETE") return;
      closeCheckout();
      const path = typeof event.data.path === "string"
        ? event.data.path
        : "/app/settings?tab=billing&checkout=success";
      navigate(path);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [closeCheckout, navigate]);

  const checkoutElement = (
    <Dialog open={isOpen} onOpenChange={(o) => !o && closeCheckout()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {isOpen && options && <StripeEmbeddedCheckout {...options} onComplete={handleCheckoutComplete} />}
      </DialogContent>
    </Dialog>
  );

  return { openCheckout, closeCheckout, isOpen, checkoutElement };
}
