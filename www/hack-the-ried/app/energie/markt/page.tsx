import { Suspense } from "react";
import PageContent from "./PageContent";
import PublicPageLoading from "../../components/PublicPageLoading";
export const dynamic = "error";
export const metadata = { title: "Strommarkt Deutschland | HackTheRied" };
export default function Page() { return <Suspense fallback={<PublicPageLoading />}><PageContent /></Suspense>; }
