import { useId, useState } from 'react'

interface FollowButtonProps {
  initialFollowing?: boolean
}

// Bootstrap btn-check toggle: "+ Follow" / "Following"
export default function FollowButton({ initialFollowing = false }: FollowButtonProps) {
  const id = useId()
  const [following, setFollowing] = useState(initialFollowing)
  return (
    <div className="btn-group" role="group" aria-label="Basic checkbox toggle button group">
      <input
        type="checkbox"
        className="btn-check"
        id={id}
        checked={following}
        onChange={(e) => setFollowing(e.target.checked)}
      />
      <label className="btn btn-outline-primary btn-sm px-3 rounded-pill" htmlFor={id}>
        <span className={following ? 'follow d-none' : 'follow'}>+ Follow</span>
        <span className={following ? 'following' : 'following d-none'}>Following</span>
      </label>
    </div>
  )
}
