import type { MouseEvent } from 'react'
import Dropdown from 'react-bootstrap/Dropdown'
import { Link } from 'react-router-dom'
import type { Comment } from '../../types'
import type { ProfilePost } from '../../data/profile'
import { useUi } from '../layout/UiContext'
import VerifiedBadge from '../common/VerifiedBadge'
import PostActions from '../feed/PostActions'
import CommentComposer from '../feed/CommentComposer'
import CommentItem from '../feed/CommentItem'
import ProfileMarketCard from './ProfileMarketCard'

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

// Actions row with the repost counter highlighted (text-primary), as on the
// Ree-Vogel / Mentions tabs of the profile page
function HighlightedRepostActions({ likes, comments, reposts }: { likes: string; comments: string; reposts: string }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-2">
      <div>
        <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light">
          <span className="material-icons md-20 me-2">thumb_up_off_alt</span>
          <span>{likes}</span>
        </a>
      </div>
      <div>
        <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light">
          <span className="material-icons md-20 me-2">chat_bubble_outline</span>
          <span>{comments}</span>
        </a>
      </div>
      <div>
        <a href="#" className="text-primary text-decoration-none d-flex align-items-start fw-light">
          <span className="material-icons md-20 me-2">repeat</span>
          <span>{reposts}</span>
        </a>
      </div>
      <div>
        <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light">
          <span className="material-icons md-18 me-2">share</span>
          <span>Share</span>
        </a>
      </div>
    </div>
  )
}

// Comment row that opens the global comment modal (data-bs-target="#commentModal" in source)
function ModalCommentItem({ comment, onOpen }: { comment: Comment; onOpen: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <div className="d-flex mb-2">
      <a href="#" className="text-white text-decoration-none" onClick={onOpen}>
        <img src={comment.avatar} className="img-fluid rounded-circle" alt="commenters-img" />
      </a>
      <div className="ms-2 small">
        <a href="#" className="text-white text-decoration-none" onClick={onOpen}>
          <div className="bg-glass px-3 py-2 rounded-4 mb-1 chat-text">
            <p className="fw-500 mb-0">{comment.author}</p>
            <span className="text-muted">{comment.text}</span>
          </div>
        </a>
        <div className="d-flex align-items-center ms-2">
          <a href="#" className="small text-muted text-decoration-none">Like</a>
          <span className="fs-3 text-muted material-icons mx-1">circle</span>
          <a href="#" className="small text-muted text-decoration-none">Reply</a>
          <span className="fs-3 text-muted material-icons mx-1">circle</span>
          <span className="small text-muted">{comment.time}</span>
        </div>
      </div>
    </div>
  )
}

// Profile-page feed post: same structure as the shared PostCard, plus the
// variants the profile page needs (custom market link/thumb, comment-modal
// triggers, highlighted repost counter, plain composer input).
export default function ProfilePostCard({ post }: { post: ProfilePost }) {
  const { openModal } = useUi()
  const { author } = post
  const compact = post.compact
  const squareAvatar = author.id === 'barcelona'

  const openCommentModal = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    openModal('comment')
  }

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
            <div className="w-100">
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
                  <a
                    href="#"
                    className="text-decoration-none"
                    onClick={post.imageOpensModal ? openCommentModal : undefined}
                  >
                    <img src={post.image} className="img-fluid rounded mb-3" alt="post-img" />
                  </a>
                )}
                {post.market && (
                  <ProfileMarketCard
                    market={post.market}
                    linkTo={post.marketLink ?? '/trade'}
                    thumbStyle={post.marketThumbStyle}
                  />
                )}
                {post.repostHighlighted ? (
                  <HighlightedRepostActions likes={post.likes} comments={post.commentsCount} reposts={post.reposts} />
                ) : (
                  <PostActions likes={post.likes} comments={post.commentsCount} reposts={post.reposts} />
                )}
                {post.commentsOpenModal ? (
                  <div className="d-flex align-items-center mb-3" onClick={() => openModal('comment')}>
                    <span className="material-icons bg-transparent border-0 text-primary pe-2 md-36">account_circle</span>
                    <input
                      type="text"
                      className={
                        post.plainComposer
                          ? 'form-control form-control-sm rounded-3 fw-light'
                          : 'form-control form-control-sm rounded-3 fw-light bg-glass form-control-text'
                      }
                      placeholder="Write Your comment"
                    />
                  </div>
                ) : (
                  <CommentComposer />
                )}
                <div className="comments">
                  {post.comments.map((comment) =>
                    post.commentsOpenModal ? (
                      <ModalCommentItem key={comment.id} comment={comment} onOpen={openCommentModal} />
                    ) : (
                      <CommentItem key={comment.id} comment={comment} />
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
