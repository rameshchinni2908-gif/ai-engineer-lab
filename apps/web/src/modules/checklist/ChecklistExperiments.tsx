import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { DesignReviewChecklist } from "./DesignReviewChecklist";
import { DesignScenarios } from "./DesignScenarios";

export function ChecklistExperiments(): JSX.Element {
  return (
    <Tabs defaultValue="checklist" className="space-y-3">
      <TabsList>
        <TabsTrigger value="checklist">Design-review checklist</TabsTrigger>
        <TabsTrigger value="scenarios">System-design scenarios</TabsTrigger>
      </TabsList>
      <TabsContent value="checklist"><DesignReviewChecklist /></TabsContent>
      <TabsContent value="scenarios"><DesignScenarios /></TabsContent>
    </Tabs>
  );
}
