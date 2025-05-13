import TypingPractice from "@/components/typing-practice"

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-slate-800 dark:text-slate-100">TypeAndHaveFun</h1>
      <TypingPractice />
    </main>
  )
}
