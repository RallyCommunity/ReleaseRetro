var REQUIRED_FIELDS = {
    c_RetroPluses: 'Retro Pluses',
    c_RetroDeltas: 'Retro Deltas',
    c_RetroActions: 'Retro Actions'
};

Ext.define('IterationRetroApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    scopeType: 'iteration',
    supportsUnscheduled: false,

    initComponent: function() {
        this.callParent(arguments);

        this.add({
            xtype: 'container',
            itemId: 'content'
        });
    },

    onScopeChange: function() {
        this.callParent(arguments);

        if (!this.models) {
            Rally.data.wsapi.ModelFactory.getModels({
                context: this.getContext(),
                types: ['Iteration', 'AttributeDefinition'],
                success: function(models) {
                    this.models = models;
                    this._loadIteration();
                },
                scope: this
            });
        } else {
            this._loadIteration();
        }
    },

    onNoAvailableTimeboxes: function() {
        this.callParent(arguments);
        var contentContainer = this.down('#content');
        if (contentContainer) {
            contentContainer.removeAll();
        }
    },

    _loadIteration: function() {
        var id = this.getContext().getTimeboxScope().getRecord().getId();
        this.models.Iteration.load(id, {
            fetch: _.keys(REQUIRED_FIELDS)
        }).then({
            success: function(iteration) {
                this.iteration = iteration;
                this._checkForFields();
            },
            scope: this
        });
    },

    _checkForFields: function() {
        var contentContainer = this.down('#content');
        contentContainer.removeAll();
        if (!_.every(_.keys(REQUIRED_FIELDS), this._fieldExists, this)) {
            var isWorkspaceAdmin = this.getContext().getPermissions().isWorkspaceOrSubscriptionAdmin(this.getContext().getWorkspace());
            contentContainer.add({
                itemId: 'missingFieldsBlankSlate',
                xtype: 'container',
                cls: 'no-data-container',
                items: [
                    {
                        xtype: 'component',
                        cls: 'primary-message',
                        html: 'One or more required Iteration custom fields are missing.'
                    },
                    {
                        xtype: 'component',
                        cls: 'secondary-message',
                        html: 'This app uses custom fields on Iteration to store retro pluses, deltas and action items.'
                    },
                    {
                        xtype: 'component',
                        cls: 'secondary-message',
                        html: isWorkspaceAdmin ?
                          'Click <a href="#" class="create-fields-link">here</a> to create these fields.' :
                          'Please contact a workspace administrator to set up these fields using this app.',
                        listeners: {
                            afterrender: function(cmp) {
                                var linkEl = cmp.getEl().down('.create-fields-link');
                                this.mon(linkEl, 'click', this._createRequiredFields, this);
                            },
                            scope: this
                        }
                    }
                ]
            });
        } else {
            contentContainer.add([
                {
                    xtype: 'panel',
                    cls: 'plus-panel',
                    title: '+',
                    titleAlign: 'center',
                    minWidth: 550,
                    items: [ this._buildEditorFor('c_RetroPluses') ]
                },
                {
                    xtype: 'panel',
                    cls: 'delta-panel',
                    title: 'Δ',
                    titleAlign: 'center',
                    minWidth: 550,
                    items: [ this._buildEditorFor('c_RetroDeltas') ]
                },
                {
                    xtype: 'panel',
                    cls: 'actions-panel',
                    title: 'Action Items',
                    titleAlign: 'center',
                    minWidth: 550,
                    items: [ this._buildEditorFor('c_RetroActions') ]
                }
            ]);
        }
    },

    _buildEditorFor: function(fieldName) {
        return {
            xtype: 'rallyrichtexteditor',
            itemId: fieldName.replace('c_R', 'r'),
            fieldName: fieldName,
            showUndoButton: true,
            margin: '0 10px',
            height: 200,
            value: this.iteration.get(fieldName),
            listeners: {
                blur: this._onEditorChange,
                scope: this
            }
        };
    },

    _fieldExists: function(name) {
        return !!_.find(this.models.Iteration.getFields(), function(field) {
            return field.isCustom() && field.getType() === 'text' && field.name === name;
        });
    },

    _createRequiredFields: function(e) {
        e.preventDefault();
        this.setLoading({ msg: 'Creating fields...' });

        var missingFields = _.reject(_.keys(REQUIRED_FIELDS), this._fieldExists, this);
        Deft.Promise.all(_.map(missingFields, this._createRequiredField, this)).then({
            success: this._requiredFieldsCreated,
            scope: this
        });
    },

    _createRequiredField: function(name) {
        //hack to make required fields persistable
        _.each(['RealAttributeType', 'Constrained', 'TypeDefinition'], function(fieldName) {
            this.models.AttributeDefinition.getField(fieldName).persist = true;
        }, this);
        //end hack

        var newField = Ext.create(this.models.AttributeDefinition, {
            RealAttributeType: 'TEXT',
            Constrained: false,
            Custom: true,
            Filterable: true,
            Sortable: false,
            Name: REQUIRED_FIELDS[name],
            TypeDefinition: Rally.util.Ref.getRelativeUri(this.models.Iteration.typeDefinition)
        });
        return newField.save();
    },

    _requiredFieldsCreated: function() {
        Rally.data.wsapi.ModelFactory.clearModels();
        Rally.data.wsapi.ModelFactory.getModel({
            context: this.getContext(),
            type: 'Iteration'
        }).then({
            success: function(model) {
                this.models.Iteration = model;
                this.setLoading(false);
                this.onScopeChange();
            },
            scope: this
        });
    },

    _onEditorChange: function(editor) {
        this.iteration.set(editor.fieldName, editor.getValue());
        this.iteration.save({
            fetch: _.keys(REQUIRED_FIELDS)
        }).then({
            success: function(iteration) {
                this.iteration = iteration;
                Ext.create('Rally.ui.detail.view.SavedIndicator', {
                    target: editor
                });
            },
            scope: this
        });
    }
});
