import Modal from 'react-bootstrap/Modal'
import Carousel from 'react-bootstrap/Carousel'
import { Link } from 'react-router-dom'
import { useUi } from '../layout/UiContext'

const comments: { avatar: string; name: string; text: string; time: string }[] = [
  {
    avatar: '/img/rmate1.jpg',
    name: 'Macie Bellis',
    text: 'Consectetur adipisicing elit.',
    time: '1h',
  },
  {
    avatar: '/img/rmate3.jpg',
    name: 'John Smith',
    text: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.',
    time: '20min',
  },
  {
    avatar: '/img/rmate2.jpg',
    name: 'Shay Jordon',
    text: 'With our vastly improved notifications system, users have more control.',
    time: '10min',
  },
]

const slides = ['/img/post-img1.jpg', '/img/post-img2.jpg', '/img/post-img3.jpg']

export default function CommentModal() {
  const { activeModal, closeModal } = useUi()
  return (
    <Modal
      show={activeModal === 'comment'}
      onHide={closeModal}
      centered
      contentClassName="rounded-4 shadow-sm overflow-hidden border-0 bg-brown-gradient"
    >
      <div className="modal-header d-none">
        <h5 className="modal-title" id="exampleModalLabel2">Modal title</h5>
        <a
          href="#"
          className="text-muted text-decoration-none material-icons ms-2 md-"
          onClick={(e) => {
            e.preventDefault()
            closeModal()
          }}
        >
          close
        </a>
      </div>
      <div className="modal-body p-0">
        <div className="row m-0">
          <div className="col-sm-7 px-0 m-sm-none">
            {/* Image Slider */}
            <div className="image-slider">
              <Carousel>
                {slides.map((src) => (
                  <Carousel.Item key={src}>
                    <img src={src} className="d-block w-100" alt="..." />
                  </Carousel.Item>
                ))}
              </Carousel>
            </div>
          </div>
          <div className="col-sm-5 content-body px-web-0">
            <div className="d-flex flex-column h-600">
              <div className="d-flex p-3 border-bottom">
                <img src="/img/rmate4.jpg" className="img-fluid rounded-circle user-img" alt="profile-img" />
                <div className="d-flex align-items-center justify-content-between w-100">
                  <Link to="/profile" className="text-decoration-none ms-3">
                    <div className="d-flex align-items-center">
                      <h6 className="fw-bold text-body mb-0">iamosahan</h6>
                      <p className="ms-2 material-icons bg-primary p-0 md-16 fw-bold text-white rounded-circle ov-icon mb-0">done</p>
                    </div>
                    <p className="text-muted mb-0 small">@johnsmith</p>
                  </Link>
                  <div className="small dropdown">
                    <a
                      href="#"
                      className="text-muted text-decoration-none material-icons ms-2 md-"
                      onClick={(e) => {
                        e.preventDefault()
                        closeModal()
                      }}
                    >
                      close
                    </a>
                  </div>
                </div>
              </div>
              <div className="comments p-3">
                {comments.map((comment) => (
                  <div className="d-flex mb-2" key={comment.name}>
                    <img src={comment.avatar} className="img-fluid rounded-circle" alt="profile-img" />
                    <div className="ms-2 small">
                      <div className="bg-glass px-3 py-2 rounded-4 mb-1 chat-text text-dark">
                        <p className="fw-500 text-white mb-0">{comment.name}</p>
                        <span className="text-muted">{comment.text}</span>
                      </div>
                      <div className="d-flex align-items-center ms-2">
                        <a href="#" className="small text-muted text-decoration-none">Like</a>
                        <span className="fs-3 text-muted material-icons mx-1">circle</span>
                        <a href="#" className="small text-muted text-decoration-none">Reply</a>
                        <span className="fs-3 text-muted material-icons mx-1">circle</span>
                        <span className="small text-muted">{comment.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-top p-3 mt-auto">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div>
                    <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light"><span className="material-icons md-20 me-2">thumb_up_off_alt</span><span>30.4k</span></a>
                  </div>
                  <div>
                    <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light"><span className="material-icons md-20 me-2">repeat</span><span>617</span></a>
                  </div>
                  <div>
                    <a href="#" className="text-muted text-decoration-none d-flex align-items-start fw-light"><span className="material-icons md-18 me-2">share</span><span>Share</span></a>
                  </div>
                </div>
                <div className="d-flex align-items-center">
                  <span className="material-icons bg-transparent border-0 text-primary pe-2 md-36">account_circle</span>
                  <div className="d-flex align-items-center border rounded-4 px-3 py-1 w-100">
                    <input type="text" className="form-control form-control-sm p-0 rounded-3 fw-light bg-transparent border-0 form-control-text" placeholder="Write Your comment" />
                    <a href="#" className="border-0 text-primary ps-2 text-decoration-none">Post</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-footer d-none">
      </div>
    </Modal>
  )
}
