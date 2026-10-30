import { Suspense } from "react";
import PageContent from "./PageContent";
import PublicPageLoading from "../../components/PublicPageLoading";
export const dynamic = "error";
export const metadata = { title: "Biodiversität im Ried | HackTheRied" };
export default function Page() { return <Suspense fallback={<PublicPageLoading />}><PageContent /></Suspense>; }
