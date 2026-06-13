import Modal from 'react-bootstrap/Modal'
import { useUi } from '../layout/UiContext'

const languages: { id: string; native: string; english: string; checked?: boolean }[] = [
  { id: 'hindi1', native: 'हिंदी', english: 'Hindi' },
  { id: 'english2', native: 'English', english: 'English', checked: true },
  { id: 'kannada3', native: 'ಕನ್ನಡ', english: 'kannada' },
  { id: 'tamil4', native: 'தமிழ்', english: 'Tamil' },
  { id: 'punjabi5', native: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { id: 'punjabi511f', native: 'Türk', english: 'Turkish' },
  { id: 'punjabi51f', native: 'français', english: 'French' },
  { id: 'other', native: 'Other', english: 'Other' },
]

export default function LanguageModal() {
  const { activeModal, closeModal } = useUi()
  return (
    <Modal
      show={activeModal === 'language'}
      onHide={closeModal}
      centered
      contentClassName="border-0 shadow-sm rounded-4 bg-brown-gradient p-4"
    >
      <div className="modal-header border-0 p-1">
        <h6 className="modal-title fw-bold text-body fs-6 d-flex justify-content-center" id="exampleModalLabel1">Choose Language</h6>
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
      <form>
        <div className="modal-body pt-0 px-0">
          <div className="row py-3 gy-3 m-0">
            {languages.map((lang, index) => (
              <div className="langauge-item col-6 col-md-3 px-1 mt-2" key={lang.id}>
                <input type="radio" className="btn-check" name="options-outlined" id={lang.id} defaultChecked={lang.checked} />
                <label
                  className={`btn btn-language btn-sm px-2 py-2 rounded-5 d-flex align-items-center justify-content-between${index >= 4 ? ' mb-2' : ''}`}
                  htmlFor={lang.id}
                >
                  <span className="text-start d-grid">
                    <small className="ln-18">{lang.native}</small>
                    <small className="ln-18">{lang.english}</small>
                  </span>
                  <span className="material-icons text-muted md-20">check_circle</span>
                </label>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer border-0 p-1">
          <button
            type="button"
            className="btn btn-primary w-100 text-decoration-none rounded-5 py-3 fw-bold text-uppercase m-0"
            onClick={closeModal}
          >
            Submit
          </button>
        </div>
      </form>
    </Modal>
  )
}
