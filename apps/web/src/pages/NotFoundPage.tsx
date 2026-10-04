import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui";

export default function NotFoundPage(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">This page doesn't exist.</p>
      <Link to="/" className={buttonVariants()}>
        Back to home
      </Link>
    </div>
  );
}
