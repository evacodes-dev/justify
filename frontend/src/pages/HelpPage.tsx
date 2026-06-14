import RightSidebar from '../components/layout/RightSidebar'
import { helpFormFields } from '../data/help'
import type { HelpFormField } from '../data/help'

function HelpFormFieldControl({ field }: { field: HelpFormField }) {
  return (
    <div className={field.wrapperClassName}>
      {field.type === 'textarea' ? (
        <textarea
          className="form-control rounded-5 bg-glass"
          id={field.id}
          placeholder={field.placeholder}
          defaultValue={field.defaultValue}
        />
      ) : (
        <input
          type={field.type}
          className="form-control rounded-5 bg-glass"
          id={field.id}
          defaultValue={field.defaultValue}
          placeholder={field.placeholder}
        />
      )}
      <label htmlFor={field.id} className="text-muted">
        {field.label}
      </label>
    </div>
  )
}

export default function HelpPage() {
  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="mb-5">
            <header className="profile d-flex align-items-center">
              <img alt="#" src="/img/images.jpeg" className="rounded-circle me-3" />
              <div>
                <span className="text-muted text_short">WELCOME</span>
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
                    {helpFormFields.map((field) => (
                      <HelpFormFieldControl key={field.id} field={field} />
                    ))}
                    <div className="d-grid">
                      <button className="btn btn-primary rounded-5 w-100 text-decoration-none py-3 fw-bold text-uppercase m-0">
                        SEND
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
