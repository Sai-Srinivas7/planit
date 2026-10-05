import { useAuthProfileReady } from 'deepspace'
import { APP_NAME } from '../../constants'
import { OutingList } from '../../features/outing/OutingList'

export default function HomePage() {
  const { isSignedIn } = useAuthProfileReady({ requireUser: true })

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      {isSignedIn && <OutingList />}
    </div>
  )
}
