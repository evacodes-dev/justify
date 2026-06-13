import RightSidebar from '../components/layout/RightSidebar'

const marketTypes: { id: string; label: string; wrapperClass: string; defaultChecked?: boolean }[] = [
  { id: 'male', label: 'FUN', wrapperClass: 'form-check' },
  { id: 'female', label: 'Classic', wrapperClass: 'form-check mx-3' },
  { id: 'not', label: 'Challenge', wrapperClass: 'form-check', defaultChecked: true },
]

export default function CreatePage() {
  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="mb-5">
            <header className="profile d-flex align-items-center">
              <img alt="#" src="/img/images.jpeg" className="rounded-circle me-3" />
              <div>
                <span className="text-muted text_short">WELCOME 👋</span>
                <h4 className="mb-0 text-white">
                  <span className="fw-bold">@founder</span>
                </h4>
              </div>
            </header>
          </div>
          {/* Feeds */}
          <div className="feeds">
            {/* Feed Item */}
            <div className="bg-glass p-4 feed-item rounded-4 shadow-sm mb-3 faq-page">
              <div className="mb-3">
                <h5 className="lead fw-bold text-body mb-0">Send your request</h5>
              </div>
              <div className="row justify-content-center">
                <div className="col-lg-12">
                  <form action="/profile">
                    <div className="form-floating mb-3 d-flex align-items-end">
                      <input
                        type="text"
                        className="form-control rounded-5 bg-glass"
                        id="floatingssName"
                        defaultValue="founder"
                        placeholder="first"
                      />
                      <label htmlFor="floatingssName" className="text-muted">MARKET NAME</label>
                    </div>
                    <div className="form-floating mb-3 d-flex align-items-center">
                      <input
                        type="email"
                        className="form-control rounded-5 bg-glass"
                        id="floatingEmail"
                        placeholder="iamosahan@gmail.com"
                        defaultValue="iamosahan@gmail.com"
                      />
                      <label htmlFor="floatingEmail" className="text-muted">DESCRIPTION</label>
                    </div>
                    <div className="">
                      <input
                        type="file"
                        className="form-control rounded-5 bg-glass"
                        id="floatingPassd"
                        placeholder="request"
                      />
                      <label
                        htmlFor="floatingPassd"
                        className="text-muted"
                        style={{ paddingBottom: '20px', paddingTop: '10px' }}
                      >
                        MARKET PHOTO
                      </label>
                    </div>
                    <div className="form-floating mb-3 d-flex align-items-center">
                      <input
                        type="email"
                        className="form-control rounded-5 bg-glass"
                        id="floatingOracle"
                        placeholder="htpps://"
                        defaultValue="htpps://"
                      />
                      <label htmlFor="floatingOracle" className="text-muted">ORACLE PROOF</label>
                    </div>
                    <label className="mb-2 text-muted small">MARKET TYPE</label>
                    <div className="d-flex align-items-center mb-3 px-0">
                      {marketTypes.map((type) => (
                        <div className={type.wrapperClass} key={type.id}>
                          <input
                            className="form-check-input"
                            type="radio"
                            name="flexRadioDefault"
                            id={type.id}
                            defaultChecked={type.defaultChecked}
                          />
                          <label className="form-check-label" htmlFor={type.id}>
                            {type.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <div className="d-grid">
                      <button className="btn btn-primary rounded-5 w-100 text-decoration-none py-3 fw-bold text-uppercase m-0">
                        CREATE
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
