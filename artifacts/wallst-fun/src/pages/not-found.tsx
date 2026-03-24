import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center">
      <div className="text-center space-y-4">
        <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto" />
        <h1 className="text-4xl font-serif font-bold text-foreground">404</h1>
        <p className="text-muted-foreground">The requested route could not be found.</p>
        <div className="pt-4">
          <Link href="/">
            <Button variant="outline">Return to Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
