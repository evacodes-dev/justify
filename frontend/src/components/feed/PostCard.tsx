import Dropdown from 'react-bootstrap/Dropdown'
import { Link } from 'react-router-dom'
import type { Post } from '../../types'
import VerifiedBadge from '../common/VerifiedBadge'
import MarketCard from '../market/MarketCard'
import PostActions from './PostActions'
import CommentComposer from './CommentComposer'
import CommentItem from './CommentItem'

function PostMenu() {
  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        as="a"
        href="#"
        bsPrefix="no-caret"
        className="text-white text-decoration-none material-icons ms-2 md-20 rounded-circle bg-glass p-1"
      >
        more_vert
      </Dropdown.Toggle>
      <Dropdown.Menu className="fs-13 dropdown-menu-end bg-light-glass">
        <Dropdown.Item className="text-dark" href="#">
          <span className="material-icons md-13 me-1">edit</span>Edit
        </Dropdown.Item>
        <Dropdown.Item className="text-dark" href="#">
          <span className="material-icons md-13 me-1">delete</span>Delete
        </Dropdown.Item>
        <Dropdown.Item className="text-dark" href="#">
          <span className="material-icons md-13 me-1 ltsp-n5">arrow_back_ios arrow_forward_ios</span>Embed Vogel
        </Dropdown.Item>
        <Dropdown.Item className="text-dark d-flex align-items-center" href="#">
          <span className="material-icons md-13 me-1">share</span>Share via another apps
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}

interface PostCardProps {
  post: Post
  // 'compact' is the trending-tab layout (d-flex instead of d-md-flex)
  variant?: 'default' | 'compact'
}

// Feed post: author header, optional text/image/market card, actions and comments
export default function PostCard({ post, variant = 'default' }: PostCardProps) {
  const { author } = post
  const compact = variant === 'compact'
  const squareAvatar = author.id === 'barcelona'
  return (
    <div className="border-bottom py-3 px-lg-3">
      <div className="bg-glass p-3 feed-item rounded-4 shadow-sm">
        <div className={compact ? 'd-flex' : 'd-md-flex'}>
          <img
            src={author.avatar}
            className={compact ? 'img-fluid rounded-circle user-img' : 'img-fluid rounded-circle user-img mb-3 mb-md-0'}
            alt="profile-img"
            style={squareAvatar ? { borderRadius: '0px' } : undefined}
          />
          <div className={compact ? 'd-flex ms-3 align-items-start w-100' : 'd-flex ms-md-3 align-items-start w-100'}>
            <div className={compact ? undefined : 'w-100'}>
              <div className="d-flex align-items-center justify-content-between">
                <Link to="/profile" className="text-decoration-none d-flex align-items-center">
                  <h6 className="fw-bold mb-0 text-body">{author.name}</h6>
                  {author.verified && <VerifiedBadge />}
                  <small className="text-muted ms-2">{author.handle}</small>
                </Link>
                <div className="d-flex align-items-center small">
                  <p className="text-muted mb-0">{post.date}</p>
                  <PostMenu />
                </div>
              </div>
              <div className="my-2">
                {post.paragraphs?.map((paragraph, i) => (
                  <p
                    key={i}
                    className={paragraph.className}
                    style={paragraph.fontSize ? { fontSize: paragraph.fontSize } : undefined}
                    dangerouslySetInnerHTML={{ __html: paragraph.html }}
                  />
                ))}
                {post.image && (
                  <a href="#" className="text-decoration-none">
                    <img src={post.image} className="img-fluid rounded mb-3" alt="post-img" />
                  </a>
                )}
                {post.market && <MarketCard market={post.market} />}
                <PostActions likes={post.likes} comments={post.commentsCount} reposts={post.reposts} />
                <CommentComposer />
                <div className="comments">
                  {post.comments.map((comment) => (
                    <CommentItem key={comment.id} comment={comment} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
