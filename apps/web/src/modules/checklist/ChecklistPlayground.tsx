import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { LearningPath } from "./LearningPath";
import { Quiz } from "./Quiz";

export function ChecklistPlayground(): JSX.Element {
  return (
    <Tabs defaultValue="path" className="space-y-3">
      <TabsList>
        <TabsTrigger value="path">Learning path</TabsTrigger>
        <TabsTrigger value="quiz">Quizzes</TabsTrigger>
      </TabsList>
      <TabsContent value="path"><LearningPath /></TabsContent>
      <TabsContent value="quiz"><Quiz /></TabsContent>
    </Tabs>
  );
}
