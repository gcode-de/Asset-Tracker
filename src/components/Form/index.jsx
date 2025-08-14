import PropTypes from "prop-types";
import styles from "./Form.module.css";
import { useState, useEffect } from "react";

export default function Form({ onFormSubmit, resetForm }) {
  const [selectedType, setSelectedType] = useState("");

  const handleChange = (event) => {
    setSelectedType(event.target.value);
  };

  return (
    <div className={`assetFormContainer`}>
      <h2>Edit asset</h2>
      <form id="form" onSubmit={onFormSubmit}>
        <div className="mdl-textfield mdl-js-textfield mdl-textfield--floating-label">
          <label className="mdl-textfield__label" htmlFor="assetTypeField">
            Type
          </label>
          <select
            className="mdl-textfield__input"
            id="assetTypeField"
            autoComplete="off"
            name="type"
            required
            value={selectedType}
            onChange={handleChange}
          >
            <option value=""></option>
            <option value="crypto">Crypto</option>
            <option value="metals">Precious Metal</option>
            <option value="stocks">Stock</option>
            <option value="real_estate">Real Estate</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <div className="mdl-textfield mdl-js-textfield mdl-textfield--floating-label">
          <label className="mdl-textfield__label" htmlFor="assetNameField">
            Asset
          </label>
          <input className="mdl-textfield__input" type="text" id="assetNameField" autoComplete="off" name="name" required />
        </div>
        <div className="mdl-textfield mdl-js-textfield mdl-textfield--floating-label">
          <label className="mdl-textfield__label" htmlFor="assetQuantityField" id="assetQuantityLabel">
            Quantity
          </label>
          <input
            className="mdl-textfield__input"
            type="text"
            pattern="-?[0-9]*(\.[0-9]+)?"
            id="assetQuantityField"
            autoComplete="off"
            name="quantity"
          />
          <span className="mdl-textfield__error">Input is not a number!</span>
          <span id="assetUnitField"></span>
        </div>
        <div className="mdl-textfield mdl-js-textfield mdl-textfield--floating-label">
          <label className="mdl-textfield__label" htmlFor="assetNotesField">
            Notes
          </label>
          <input className="mdl-textfield__input" type="text" id="assetNotesField" autoComplete="off" name="notes" />
        </div>
        <input type="text" id="assetIdField" name="id" hidden defaultValue={"useCurrentAsset()?._id"} />
        <button className="mdl-button mdl-js-button mdl-button--raised mdl-button--accent" id="saveButton">
          Save
        </button>
      </form>
      <button
        className="mdl-button mdl-js-button mdl-button--raised mdl-button--colored"
        id="cancelButton"
        onClick={() => {
          resetForm();
        }}
      >
        Cancel
      </button>
    </div>
  );
}

Form.propTypes = {
  resetForm: PropTypes.func.isRequired,
  onFormSubmit: PropTypes.func.isRequired,
};
