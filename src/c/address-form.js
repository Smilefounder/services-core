import m from 'mithril';
import _ from 'underscore';
import postgrest from 'mithril-postgrest';
import I18n from 'i18n-js';
import h from '../h';
import models from '../models';
import inlineError from '../c/inline-error';

const I18nScope = _.partial(h.i18nScope, 'activerecord.attributes.address');

const addressForm = {
    controller(args) {
        const countriesLoader = postgrest.loader(models.country.getPageOptions()),
            statesLoader = postgrest.loader(models.state.getPageOptions()),
            countries = m.prop(),
            defaultCountryID = 36,
            states = m.prop(),
            data = args.fields().addresses_attributes,
            fields = {
                id: m.prop(data.id || ''),
                countryID: m.prop(data.country_id || defaultCountryID),
                stateID: m.prop(data.state_id || ''),
                addressStreet: m.prop(data.address_street || ''),
                addressNumber: m.prop(data.address_number || ''),
                addressComplement: m.prop(data.address_complement || ''),
                addressNeighbourhood: m.prop(data.address_neighbourhood || ''),
                addressCity: m.prop(data.address_city || ''),
                addressState: m.prop(data.address_state || ''),
                addressZipCode: m.prop(data.address_zip_code || ''),
                phoneNumber: m.prop(data.phone_number || '')
            },
            errors = {
                countryID: m.prop(false),
                stateID: m.prop(false),
                addressStreet: m.prop(false),
                addressNumber: m.prop(false),
                addressComplement: m.prop(false),
                addressNeighbourhood: m.prop(false),
                addressCity: m.prop(false),
                addressState: m.prop(false),
                addressZipCode: m.prop(false),
                phoneNumber: m.prop(false)
            },
            international = m.prop(fields.countryID() !== '' && fields.countryID() !== defaultCountryID),
            disableFields = m.prop(_.isEmpty(fields.addressStreet()));

        _.extend(args.fields(), {
            validate: () => {
                let hasError = false;
                const fieldsToIgnore = international() ? ['id', 'stateID', 'addressComplement', 'addressNumber', 'addressNeighbourhood', 'phoneNumber'] : ['id', 'addressComplement', 'addressState'];
                _.mapObject(errors, (val, key) => {
                    val(false);
                });
                _.mapObject(_.omit(fields, fieldsToIgnore), (val, key) => {
                    if (!val()) {
                        errors[key](true);
                        hasError = true;
                    }
                });
                return !hasError;
            }
        });

        const lookupZipCode = (zipCode) => {
            fields.addressZipCode(zipCode);
            if (zipCode.length === 8) {
                m.request({
                    method: 'GET',
                    url: `https://api.pagar.me/1/zipcodes/${zipCode}`
                }).then((response) => {
                    disableFields(false);
                    fields.addressStreet(response.street);
                    fields.addressNeighbourhood(response.neighborhood);
                    fields.addressCity(response.city);
                    fields.stateID(_.find(states(), state => state.acronym === response.state).id);
                    errors.addressStreet(false);
                    errors.addressNeighbourhood(false);
                    errors.addressCity(false);
                    errors.stateID(false);
                    errors.addressZipCode(false);
                }).catch(() => {
                    disableFields(false);
                    errors.addressZipCode(true);
                });
            } else {
                errors.addressZipCode(true);
            }
        };

        countriesLoader.load().then(countryData => countries(_.sortBy(countryData, 'name_en')));
        statesLoader.load().then(states);
        return {
            lookupZipCode,
            errors,
            defaultCountryID,
            disableFields,
            fields,
            international,
            states,
            countries
        };
    },
    view(ctrl, args) {
        const fields = ctrl.fields,
            international = ctrl.international,
            errors = ctrl.errors,
            address = {
                id: fields.id(),
                country_id: fields.countryID(),
                state_id: fields.stateID(),
                address_street: fields.addressStreet(),
                address_number: fields.addressNumber(),
                address_complement: fields.addressComplement(),
                address_neighbourhood: fields.addressNeighbourhood(),
                address_city: fields.addressCity(),
                address_state: fields.addressState(),
                address_zip_code: fields.addressZipCode(),
                phone_number: fields.phoneNumber()
            };

        args.fields().addresses_attributes = address;
        args.countryName(ctrl.countries() && fields.countryID() ? _.find(ctrl.countries(), country => country.id === parseInt(fields.countryID())).name_en : '');
        args.stateName(ctrl.states() && fields.stateID() ? _.find(ctrl.states(), state => state.id === parseInt(fields.stateID())).name : '');

        return m('#address-form.u-marginbottom-30.w-form', [
            m('.card.card-terciary.u-marginbottom-30.u-radius.w-form', [
                m('div',
                    m('.w-row', [
                        m('.w-col.w-col-4',
                            m('.fontsize-small.fontweight-semibold',
                                'Nacionalidade:'
                            )
                        ),
                        m('.w-col.w-col-4',
                            m('.fontsize-small.w-radio', [
                                m("input.w-radio-input[name='nationality'][type='radio']", {
                                    checked: !international(),
                                    onclick: () => {
                                        fields.countryID(ctrl.defaultCountryID);
                                        international(false);
                                    }
                                }),
                                m('label.w-form-label',
                                    'Brasileiro (a)'
                                )
                            ])
                        ),
                        m('.w-col.w-col-4',
                            m('.fontsize-small.w-radio', [
                                m("input.w-radio-input[name='nationality'][type='radio']", {
                                    checked: international(),
                                    onclick: () => {
                                        international(true);
                                    }
                                }),
                                m('label.w-form-label',
                                    'International backer'
                                )
                            ])
                        )
                    ])
                )
            ]),
            // @TODO move to another component
            (international() ?
                m('form', [
                    m('.u-marginbottom-30.w-row', [
                        m('.w-col.w-col-6', [
                            m('.field-label.fontweight-semibold', [
                                'País / ',
                                m('em',
                                    'Country'
                                ),
                                ' *'
                            ]),
                            m('select.positive.text-field.w-select', {
                                onchange: m.withAttr('value', ctrl.fields.countryID)
                            }, [
                                (!_.isEmpty(ctrl.countries()) ?
                                    _.map(ctrl.countries(), country => m('option', {
                                        selected: country.id === ctrl.fields.countryID(),
                                        value: country.id
                                    },
                                        country.name_en
                                    )) :
                                    '')
                            ])
                        ]),
                        m('.w-col.w-col-6')
                    ]),
                    m('div', [
                        m('.field-label.fontweight-semibold',
                            'Address *'
                        ),
                        m("input.positive.text-field.w-input[required='required'][type='text']", {
                            class: errors.addressStreet() ? 'error' : '',
                            value: ctrl.fields.addressStreet(),
                            onchange: m.withAttr('value', ctrl.fields.addressStreet)
                        }),
                        errors.addressStreet() ? m(inlineError, {
                            message: 'Please fill in an address.'
                        }) : '',
                        m('div',
                            m('.w-row', [
                                m('.w-sub-col.w-col.w-col-4', [
                                    m('.field-label.fontweight-semibold',
                                        'Zip Code *'
                                    ),
                                    m("input.positive.text-field.w-input[required='required'][type='text']", {
                                        class: errors.addressZipCode() ? 'error' : '',
                                        value: ctrl.fields.addressZipCode(),
                                        onchange: m.withAttr('value', ctrl.fields.addressZipCode)
                                    }),
                                    errors.addressZipCode() ? m(inlineError, {
                                        message: 'ZipCode is required'
                                    }) : '',
                                ]),
                                m('.w-sub-col.w-col.w-col-4', [
                                    m('.field-label.fontweight-semibold',
                                        'City *'
                                    ),
                                    m("input.positive.text-field.w-input[required='required'][type='text']", {
                                        class: errors.addressCity() ? 'error' : '',
                                        value: ctrl.fields.addressCity(),
                                        onchange: m.withAttr('value', ctrl.fields.addressCity)
                                    }),
                                    errors.addressCity() ? m(inlineError, {
                                        message: 'City is required'
                                    }) : ''
                                ]),
                                m('.w-col.w-col-4', [
                                    m('.field-label.fontweight-semibold',
                                        'State *'
                                    ),
                                    m("input.positive.text-field.w-input[required='required'][type='text']", {
                                        class: errors.addressState() ? 'error' : '',
                                        value: ctrl.fields.addressState(),
                                        onchange: m.withAttr('value', ctrl.fields.addressState)
                                    }),
                                    errors.addressState() ? m(inlineError, {
                                        message: 'State is required'
                                    }) : ''
                                ])
                            ])
                        )
                    ])
                ]) :
                m('.w-form', [
                    m('div', [
                        m('.u-marginbottom-30.w-row', [
                            m('.w-col.w-col-6', [
                                m('.field-label.fontweight-semibold', [
                                    'País / ',
                                    m('em',
                                        'Country'
                                    ),
                                    ' *'
                                ]),
                                m('select.positive.text-field.w-select', {
                                    onchange: m.withAttr('value', ctrl.fields.countryID)
                                }, [
                                    (!_.isEmpty(ctrl.countries()) ?
                                        _.map(ctrl.countries(), country => m('option', {
                                            selected: country.id === ctrl.fields.countryID(),
                                            value: country.id
                                        },
                                            country.name_en
                                        )) :
                                        '')
                                ])
                            ]),
                            m('.w-col.w-col-6')
                        ]),
                        m('div', [
                            m('.w-row', [
                                m('.w-col.w-col-6', [
                                    m('.field-label', [
                                        m('span.fontweight-semibold',
                                            I18n.t('address_zip_code', I18nScope())
                                        ),
                                        m("a.fontsize-smallest.alt-link.u-right[href='http://www.buscacep.correios.com.br/sistemas/buscacep/'][target='_blank']",
                                            I18n.t('zipcode_unknown', I18nScope())
                                        )
                                    ]),
                                    m("input.positive.text-field.w-input[placeholder='Digite apenas números'][required='required'][type='text']", {
                                        class: errors.addressZipCode() ? 'error' : '',
                                        value: ctrl.fields.addressZipCode(),
                                        onchange: (e) => {
                                            ctrl.lookupZipCode(e.target.value);
                                        }
                                    }),
                                    errors.addressZipCode() ? m(inlineError, {
                                        message: 'Informe um CEP válido.'
                                    }) : ''
                                ]),
                                m('.w-col.w-col-6')
                            ]),
                            m('div', [
                                m('.field-label.fontweight-semibold', {
                                    class: ctrl.disableFields() ? 'fontcolor-terciary' : ''
                                },
                                    `${I18n.t('address_street', I18nScope())} *`
                                ),
                                m("input.positive.text-field.text-field-faded.w-input[maxlength='256'][required='required'][type='text']", {
                                    class: errors.addressStreet() ? 'error' : '',
                                    disabled: ctrl.disableFields(),
                                    value: ctrl.fields.addressStreet(),
                                    onchange: m.withAttr('value', ctrl.fields.addressStreet)
                                }),
                                errors.addressStreet() ? m(inlineError, {
                                    message: 'Informe um endereço.'
                                }) : ''
                            ]),
                            m('.w-row', [
                                m('.w-sub-col.w-col.w-col-4', [
                                    m('.field-label.fontweight-semibold', {
                                        class: ctrl.disableFields() ? 'fontcolor-terciary' : ''
                                    },
                                        `${I18n.t('address_number', I18nScope())} *`
                                    ),
                                    m("input.positive.text-field.text-field-faded.w-input[required='required'][type='text']", {
                                        class: errors.addressNumber() ? 'error' : '',
                                        disabled: ctrl.disableFields(),
                                        value: ctrl.fields.addressNumber(),
                                        onchange: m.withAttr('value', ctrl.fields.addressNumber)
                                    }),
                                    errors.addressNumber() ? m(inlineError, {
                                        message: 'Informe um número.'
                                    }) : ''
                                ]),
                                m('.w-sub-col.w-col.w-col-4', [
                                    m('.field-label.fontweight-semibold', {
                                        class: ctrl.disableFields() ? 'fontcolor-terciary' : ''
                                    },
                                        `${I18n.t('address_complement', I18nScope())} *`
                                    ),
                                    m("input.positive.text-field.text-field-faded.w-input[required='required'][type='text']", {
                                        disabled: ctrl.disableFields(),
                                        value: ctrl.fields.addressComplement(),
                                        onchange: m.withAttr('value', ctrl.fields.addressComplement)
                                    })
                                ]),
                                m('.w-col.w-col-4', [
                                    m('.field-label.fontweight-semibold', {
                                        class: ctrl.disableFields() ? 'fontcolor-terciary' : ''
                                    },
                                        `${I18n.t('address_neighbourhood', I18nScope())} *`
                                    ),
                                    m("input.positive.text-field.text-field-faded.w-input[required='required'][type='text']", {
                                        class: errors.addressNeighbourhood() ? 'error' : '',
                                        disabled: ctrl.disableFields(),
                                        value: ctrl.fields.addressNeighbourhood(),
                                        onchange: m.withAttr('value', ctrl.fields.addressNeighbourhood)
                                    }),
                                    errors.addressNeighbourhood() ? m(inlineError, {
                                        message: 'Informe um bairro.'
                                    }) : ''
                                ])
                            ]),
                            m('.w-row', [
                                m('.w-sub-col.w-col.w-col-6', [
                                    m('.field-label.fontweight-semibold', {
                                        class: ctrl.disableFields() ? 'fontcolor-terciary' : ''
                                    },
                                        `${I18n.t('address_city', I18nScope())} *`
                                    ),
                                    m("input.positive.text-field.w-input[required='required'][type='text']", {
                                        class: errors.addressCity() ? 'error' : '',
                                        disabled: ctrl.disableFields(),
                                        value: ctrl.fields.addressCity(),
                                        onchange: m.withAttr('value', ctrl.fields.addressCity)
                                    }),
                                    errors.addressCity() ? m(inlineError, {
                                        message: 'Informe uma cidade.'
                                    }) : ''
                                ]),
                                m('.w-col.w-col-6', [
                                    m('.field-label.fontweight-semibold', {
                                        class: ctrl.disableFields() ? 'fontcolor-terciary' : ''
                                    },
                                        `${I18n.t('address_state', I18nScope())} *`
                                    ),
                                    m('select.positive.text-field.text-field-faded.w-select', {
                                        class: errors.stateID() ? 'error' : '',
                                        disabled: ctrl.disableFields(),
                                        onchange: m.withAttr('value', ctrl.fields.stateID)
                                    }, [
                                        m('option[value=\'\']'),
                                        (!_.isEmpty(ctrl.states()) ?
                                            _.map(ctrl.states(), state => m('option', {
                                                value: state.id,
                                                selected: state.id === ctrl.fields.stateID()
                                            },
                                                state.name
                                            )) : ''),
                                    ]),
                                    errors.stateID() ? m(inlineError, {
                                        message: 'Informe um estado.'
                                    }) : ''
                                ])
                            ]),
                            m('.w-row', [
                                m('.w-col.w-col-6', [
                                    m('.field-label.fontweight-semibold',
                                        `${I18n.t('phone_number', I18nScope())} *`
                                    ),
                                    m("input.positive.text-field.w-input[placeholder='Digite apenas números'][required='required'][type='text']", {
                                        class: errors.phoneNumber() ? 'error' : '',
                                        value: ctrl.fields.phoneNumber(),
                                        onchange: m.withAttr('value', ctrl.fields.phoneNumber)
                                    }),
                                    errors.phoneNumber() ? m(inlineError, {
                                        message: 'Informe um telefone.'
                                    }) : ''
                                ]),
                                m('.w-col.w-col-6')
                            ])
                        ])
                    ])
                ]))
        ]);
    }
};

export default addressForm;
